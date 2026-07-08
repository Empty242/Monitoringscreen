from pathlib import Path
import csv
import json
from collections import defaultdict

base = Path(__file__).resolve().parent


def read_tsv(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return list(csv.DictReader(fh, delimiter="\t"))


host_rows = read_tsv(base / "host_detail.dat")
pref_rows = read_tsv(base / "pref_tsar.dat")
disk_rows = read_tsv(base / "disk_tsar.dat")

for row in pref_rows + disk_rows:
    if "ts" in row:
        row["ts"] = int(row["ts"])
    if "value" in row:
        row["value"] = float(row["value"])

hosts = {row["hostid"]: row for row in host_rows}

latest_pref_by_host = {}
for host_id in hosts:
    host_pref = [row for row in pref_rows if row["hostid"] == host_id]
    if not host_pref:
        continue
    latest_ts = max(row["ts"] for row in host_pref)
    latest_values = {row["mod"]: row["value"] for row in host_pref if row["ts"] == latest_ts}
    latest_pref_by_host[host_id] = {
        "ts": latest_ts,
        **latest_values,
    }

# Aggregate performance trend over time
cpu_series = []
mem_series = []
load_series = []

ts_to_cpu = defaultdict(list)
ts_to_mem = defaultdict(list)
ts_to_load = defaultdict(list)

for row in pref_rows:
    if row["mod"] == "cpu_usage":
        ts_to_cpu[row["ts"]].append(row["value"])
    if row["mod"] == "mem_used":
        ts_to_mem[row["ts"]].append(row["value"])
    if row["mod"] == "load1":
        ts_to_load[row["ts"]].append(row["value"])

for ts in sorted(ts_to_cpu):
    values = ts_to_cpu[ts]
    mem_values = ts_to_mem.get(ts, [])
    load_values = ts_to_load.get(ts, [])
    if not values:
        continue
    cpu_series.append({
        "ts": ts,
        "cpu": round(sum(values) / len(values), 2),
        "memory": round(sum(mem_values) / len(mem_values), 2) if mem_values else 0,
        "load": round(sum(load_values) / len(load_values), 2) if load_values else 0,
    })

# Sample a readable window
cpu_series = cpu_series[-16:]

# Host summary
host_summaries = []
for host_id, host_meta in hosts.items():
    metrics = latest_pref_by_host.get(host_id, {})
    cpu = metrics.get("cpu_usage", 0)
    mem_used = metrics.get("mem_used", 0)
    mem_free = metrics.get("mem_free", 0)
    mem_buff = metrics.get("mem_buff", 0)
    mem_cache = metrics.get("mem_cache", 0)
    mem_swap = metrics.get("mem_swap", 0)
    total_mem = mem_used + mem_free + mem_buff + mem_cache + mem_swap
    mem_pct = round((mem_used / total_mem) * 100, 2) if total_mem else 0
    load1 = metrics.get("load1", 0)
    net_in = metrics.get("net_in", 0)
    net_out = metrics.get("net_out", 0)

    if cpu >= 90 or load1 >= 20:
        status = "critical"
    elif cpu >= 70 or load1 >= 10:
        status = "warning"
    else:
        status = "normal"

    host_summaries.append({
        "hostid": host_id,
        "hostname": host_meta["hostname"],
        "owner": host_meta["owner"],
        "location": host_meta["location1"],
        "model": host_meta["model"],
        "cpu": round(cpu, 2),
        "memory": round(mem_pct, 2),
        "load": round(load1, 2),
        "netIn": round(net_in, 2),
        "netOut": round(net_out, 2),
        "status": status,
    })

host_summaries.sort(key=lambda item: item["cpu"], reverse=True)

# Disk alert summary
latest_disk_per_host = {}
for row in disk_rows:
    host_id = row["hostid"]
    if row["mod"].endswith("_util"):
        latest_disk_per_host.setdefault(host_id, []).append(row)

alerts = []
for host_id, rows in latest_disk_per_host.items():
    max_util = max(row["value"] for row in rows)
    if max_util >= 85:
        host_meta = hosts.get(host_id, {})
        alerts.append({
            "hostid": host_id,
            "hostname": host_meta.get("hostname", host_id),
            "location": host_meta.get("location1", "未知"),
            "util": round(max_util, 2),
            "severity": "critical" if max_util >= 95 else "warning",
        })
alerts.sort(key=lambda item: item["util"], reverse=True)

# Location and owner distributions
location_stats = defaultdict(int)
owner_stats = defaultdict(int)
for item in host_summaries:
    location_stats[item["location"]] += 1
    owner_stats[item["owner"]] += 1

summary = {
    "hostCount": len(host_summaries),
    "healthyHosts": sum(1 for item in host_summaries if item["status"] == "normal"),
    "warningHosts": sum(1 for item in host_summaries if item["status"] == "warning"),
    "criticalHosts": sum(1 for item in host_summaries if item["status"] == "critical"),
    "avgCpu": round(sum(item["cpu"] for item in host_summaries) / len(host_summaries), 2) if host_summaries else 0,
    "avgMemory": round(sum(item["memory"] for item in host_summaries) / len(host_summaries), 2) if host_summaries else 0,
    "peakCpuHost": host_summaries[0]["hostname"] if host_summaries else "无数据",
    "peakDiskHost": alerts[0]["hostname"] if alerts else "无告警",
}

payload = {
    "generatedAt": int(__import__("time").time() * 1000),
    "summary": summary,
    "hosts": host_summaries[:8],
    "cpuTrend": [
        {
            "label": f"{i+1}",
            "cpu": point["cpu"],
            "memory": round(point["memory"] / 1000, 2) if point["memory"] else 0,
            "load": point["load"],
        }
        for i, point in enumerate(cpu_series)
    ],
    "locationStats": [{"name": name, "value": count} for name, count in sorted(location_stats.items())],
    "ownerStats": [{"name": name, "value": count} for name, count in sorted(owner_stats.items())],
    "alerts": alerts[:8],
}

(base / "data.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print("dashboard data generated")
