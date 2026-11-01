#!/usr/bin/env python3
"""MBI Inventra launch gate (Phase 7).

Boots the server in memory mode on a fresh port and exercises the full
endpoint surface end to end: auth, provisioning guards, inventory, POS,
khata, reports, transfers, accounting, prescriptions, attendance,
payroll, orders, licenses, master endpoints, public store and sync.

Usage: python3 scripts/gate.py [port]
Exit 0 only when every check passes. No live MariaDB, no browser and no
NexPanel steps are covered here — those stay explicitly NOT live-verified
in the launch report.
"""
import json, os, signal, subprocess, sys, time, urllib.error, urllib.request

PORT = sys.argv[1] if len(sys.argv) > 1 else "3199"
BASE = f"http://127.0.0.1:{PORT}"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = dict(os.environ, PORT=PORT, JWT_SECRET="gate-test-secret-only",
           MASTER_ADMIN_KEY="gate-master-key", STORAGE_MODE="memory")

fails = []


def req(method, path, body=None, headers=None):
    r = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"content-type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")
    except Exception as e:
        return 0, {"error": str(e)}


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else detail)
    if not cond:
        fails.append(name)


def main():
    build = subprocess.run(["npm", "run", "build"], cwd=ROOT,
                           capture_output=True, text=True)
    check("build green", build.returncode == 0, build.stderr[-500:])
    if build.returncode:
        print("FAILURES:", fails); return 1
    proc = subprocess.Popen(["node", "dist/server.js"], cwd=ROOT, env=ENV,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True)
    try:
        for _ in range(40):
            s, _ = req("GET", "/health")
            if s == 200:
                break
            time.sleep(0.5)
        check("health", s == 200)
        s, d = req("GET", "/api/catalog")
        check("catalog plans", s == 200 and "basic" in d["plans"] and "advanced" in d["plans"], d)
        s, d = req("POST", "/api/auth/login", {"login": "owner", "password": "wrongpass", "deviceName": "Gate"})
        check("bad login 401", s == 401, d)
        s, login = req("POST", "/api/auth/login", {"login": "owner", "password": "demo12345", "deviceName": "Gate device"})
        check("owner login", s == 200, login)
        H = {"authorization": "Bearer " + login["token"]}
        MK = {"x-master-key": "gate-master-key"}
        s, d = req("GET", "/api/me", headers=H)
        check("me", s == 200 and d["tenant"]["id"] == "tenant_demo", d)
        s, d = req("GET", "/api/dashboard", headers=H)
        check("dashboard", s == 200 and "revenue" in d["summary"], d)
        s, d = req("GET", "/api/me")
        check("me without token 401", s == 401, d)
        s, d = req("POST", "/api/public/register", {"name": "X", "ownerName": "Y", "ownerLogin": "z", "ownerPassword": "12345678", "branchName": "B"})
        check("public register memory mode 503", s == 503 and d.get("error") == "STORAGE_NOT_MARIADB", d)
        s, d = req("GET", "/api/master/tenants", headers=MK)
        check("master tenants memory mode 503", s == 503, d)

        # Inventory
        s, med = req("POST", "/api/inventory/medicines", {"sku": "GATE-1", "name": "Gate Medicine"}, headers=H)
        check("create medicine", s == 201, med)
        mid = med["medicine"]["id"]
        s, d = req("POST", "/api/inventory/medicines", {"sku": "GATE-1", "name": "Dup"}, headers=H)
        check("duplicate sku 409", s == 409, d)
        s, bat = req("POST", "/api/inventory/batches", {"medicineId": mid, "batchNo": "GATE-B1", "expiryDate": "2030-01-01", "purchasePrice": 10, "salePrice": 20}, headers=H)
        check("create batch", s == 201, bat)
        bid = bat["batch"]["id"]
        s, d = req("POST", "/api/inventory/stock/adjust", {"branchId": "branch_isb", "batchId": bid, "quantity": 100, "movementType": "purchase", "idempotencyKey": "gate-seed"}, headers=H)
        check("stock adjust +100", s == 200, d)
        s, d = req("POST", "/api/inventory/stock/adjust", {"branchId": "branch_isb", "batchId": bid, "quantity": -200, "movementType": "adjust", "idempotencyKey": "gate-neg"}, headers=H)
        check("negative stock blocked 400", s == 400, d)
        s, d = req("GET", "/api/inventory/alerts", headers=H)
        check("alerts", s == 200 and "lowStock" in d, d)

        # Home layout + AI credits (no Groq key -> 503, no consume)
        s, d = req("POST", "/api/home/layout", {"layout": ["kpis", "branch", "alerts", "top", "activity", "command"]}, headers=H)
        check("home layout save", s == 200, d)
        s, d = req("POST", "/api/home/layout", {"layout": ["kpis"]}, headers=H)
        check("home layout invalid 400", s == 400, d)
        s, creds = req("GET", "/api/ai/credits", headers=H)
        check("ai credits", s == 200 and creds["credits"]["total"] == 300, creds)
        s, d = req("POST", "/api/ai/chat", {"message": "hello"}, headers=H)
        check("ai chat without key 503", s == 503, d)

        # Parties / khata
        s, cust = req("POST", "/api/parties", {"type": "customer", "name": "Gate Customer"}, headers=H)
        check("create party", s == 201, cust)
        cust_id = cust["party"]["id"]
        s, sup = req("POST", "/api/parties", {"type": "supplier", "name": "Gate Supplier"}, headers=H)
        sup_id = sup["party"]["id"]

        # POS: cash sale, credit sale, return
        s, sale = req("POST", "/api/sales", {"branchId": "branch_isb", "items": [{"medicineId": mid, "quantity": 5}], "paymentType": "cash", "paidAmount": 100}, headers=H)
        check("cash sale", s == 201 and sale["sale"]["total"] == 100, sale)
        sale_id = sale["sale"]["id"]
        s, d = req("POST", "/api/sales", {"branchId": "branch_isb", "customerId": cust_id, "items": [{"medicineId": mid, "quantity": 2}], "paymentType": "credit", "paidAmount": 0}, headers=H)
        check("credit sale", s == 201 and d["sale"]["balanceDue"] == 40, d)
        s, d = req("GET", f"/api/parties/{cust_id}/statement", headers=H)
        check("khata balance 40", s == 200 and d["balance"] == 40, d)
        s, d = req("POST", f"/api/parties/{cust_id}/pay", {"amount": 40}, headers=H)
        check("khata payment", s == 200, d)
        s, sale_full = req("GET", f"/api/sales/{sale_id}", headers=H)
        batch_of_sale = sale_full["sale"]["items"][0]["batchId"]
        s, d = req("POST", f"/api/sales/{sale_id}/return", {"items": [{"medicineId": mid, "batchId": batch_of_sale, "quantity": 1}]}, headers=H)
        check("sale return", s == 200, d)

        # Purchases + approve
        s, pur = req("POST", "/api/purchases", {"branchId": "branch_isb", "supplierId": sup_id, "items": [{"medicineId": mid, "batchNo": "GATE-B2", "expiryDate": "2031-01-01", "purchasePrice": 10, "salePrice": 20, "quantity": 10}], "paidAmount": 0}, headers=H)
        check("purchase approved by owner", s == 201 and pur["purchase"]["status"] == "approved", pur)

        # Reports / accounting / transfers
        s, d = req("GET", "/api/reports/sales", headers=H)
        check("sales report", s == 200 and d["report"]["totalSales"] >= 2, d)
        exp_req = urllib.request.Request(BASE + "/api/reports/sales/export", headers={"authorization": H["authorization"]})
        try:
            with urllib.request.urlopen(exp_req, timeout=15) as resp:
                exp_body = resp.read().decode()
                exp_status = resp.status
        except urllib.error.HTTPError as e:
            exp_body, exp_status = "", e.code
        check("sales export csv", exp_status == 200 and exp_body.startswith("invoice_no,"), exp_body[:80])
        s, d = req("GET", "/api/accounting/summary", headers=H)
        check("accounting", s == 200 and "revenue" in d["accounting"], d)
        s, tr = req("POST", "/api/transfers", {"medicineId": mid, "batchId": bid, "fromBranchId": "branch_isb", "toBranchId": "branch_lhr", "quantity": 5}, headers=H)
        check("transfer request", s == 201, tr)
        s, d = req("POST", f"/api/transfers/{tr['transfer']['id']}/approve", {}, headers=H)
        check("transfer approve", s == 200 and d["transfer"]["status"] == "approved", d)

        # Prescriptions + controlled gate
        s, cmed = req("POST", "/api/inventory/medicines", {"sku": "GATE-C1", "name": "Gate Controlled", "isControlled": True}, headers=H)
        cmid = cmed["medicine"]["id"]
        s, cbat = req("POST", "/api/inventory/batches", {"medicineId": cmid, "batchNo": "GATE-CB1", "expiryDate": "2030-01-01", "purchasePrice": 5, "salePrice": 15}, headers=H)
        cbid = cbat["batch"]["id"]
        s, d = req("POST", "/api/inventory/stock/adjust", {"branchId": "branch_isb", "batchId": cbid, "quantity": 10, "movementType": "purchase", "idempotencyKey": "gate-ctrl"}, headers=H)
        check("controlled stock", s == 200, d)
        s, d = req("POST", "/api/sales", {"branchId": "branch_isb", "items": [{"medicineId": cmid, "quantity": 1}], "paymentType": "cash", "paidAmount": 15}, headers=H)
        check("controlled sale without prescription blocked", s == 400, d)
        s, rx = req("POST", "/api/prescriptions", {"patientName": "Gate Patient", "doctorName": "Gate Doctor", "branchId": "branch_isb", "items": [{"medicineId": cmid, "quantity": 2}]}, headers=H)
        check("prescription create", s == 201, rx)
        s, d = req("POST", "/api/sales", {"branchId": "branch_isb", "prescriptionId": rx["prescription"]["id"], "items": [{"medicineId": cmid, "quantity": 1}], "paymentType": "cash", "paidAmount": 15}, headers=H)
        check("controlled sale with prescription", s == 201, d)
        s, d = req("GET", "/api/controlled-log", headers=H)
        check("controlled log", s == 200 and len(d["logs"]) >= 1, d)

        # Attendance + payroll
        s, d = req("POST", "/api/attendance/check-in", {"branchId": "branch_isb"}, headers=H)
        check("check-in", s == 201, d)
        s, d = req("POST", "/api/attendance/check-out", {}, headers=H)
        check("check-out", s == 200, d)
        s, d = req("POST", "/api/attendance/check-in", {"branchId": "branch_isb"}, headers=H)
        check("double check-in 409", s == 409, d)
        month = time.strftime("%Y-%m")
        s, d = req("GET", f"/api/payroll?month={month}", headers=H)
        check("payroll has owner row", s == 200 and any(r["userId"] == "user_owner" for r in d["payroll"]), d)
        s, d = req("POST", "/api/staff/user_pharmacist/salary", {"monthlySalary": 50000}, headers=H)
        check("set salary", s == 200, d)

        # Public store + orders
        s, d = req("GET", "/api/public/store/tenant_demo", headers={})
        check("public store", s == 200 and d["store"]["name"] == "MBI Inventra Demo", d)
        s, d = req("GET", "/api/public/store/tenant_demo/products?branchId=branch_isb", headers={})
        check("public products include gate medicine", s == 200 and any(p["medicineId"] == mid for p in d["products"]), d)
        s, order = req("POST", "/api/public/store/tenant_demo/orders", {"branchId": "branch_isb", "customerName": "Gate Buyer", "customerPhone": "03001234567", "items": [{"medicineId": mid, "quantity": 2}]})
        check("public order placed", s == 201 and order["order"]["status"] == "pending", order)
        oid = order["order"]["id"]
        s, d = req("GET", "/api/orders", headers=H)
        check("staff orders list", s == 200 and any(o["id"] == oid for o in d["orders"]), d)
        s, d = req("POST", f"/api/orders/{oid}/confirm", {}, headers=H)
        check("order confirm", s == 200 and d["order"]["status"] == "confirmed", d)
        s, d = req("POST", f"/api/orders/{oid}/deliver", {}, headers=H)
        check("order deliver", s == 200 and d["order"]["status"] == "delivered", d)

        # Sync
        s, d = req("GET", "/api/sync/health", headers=H)
        check("sync health cursor", s == 200 and d["cursorImplemented"] is True, d)
        cursor_before = d["cursor"]
        s, d = req("POST", "/api/sync/push", {"baseCursor": 0, "records": [{"idempotencyKey": "gate-sync-1", "branchId": "branch_isb", "batchId": bid, "quantity": -2, "movementType": "adjust"}]}, headers=H)
        check("sync push applied", s == 200 and d["applied"] == 1, d)
        s, d = req("POST", "/api/sync/push", {"baseCursor": 0, "records": [{"idempotencyKey": "gate-sync-1", "branchId": "branch_isb", "batchId": bid, "quantity": -2, "movementType": "adjust"}]}, headers=H)
        check("sync push replayed", s == 200 and d["replayed"] == 1 and d["applied"] == 0, d)
        s, d = req("GET", f"/api/sync/pull?cursor={cursor_before}", headers=H)
        check("sync pull advances", s == 200 and len(d["events"]) >= 1 and d["newCursor"] > cursor_before, d)

        # Master endpoints (memory mode: licenses, health, devices, domains, notes, subscriptions, announcements, export)
        s, d = req("GET", "/api/master/health", headers=MK)
        check("master health", s == 200 and d["tenants"] == 1, d)
        s, d = req("GET", "/api/master/licenses", headers={"x-master-key": "wrong"})
        check("licenses wrong key 403", s == 403, d)
        s, lic = req("POST", "/api/master/licenses", {"tenantId": "tenant_demo", "plan": "advanced", "lifetime": True}, headers=MK)
        check("license create", s == 201, lic)
        lic_id = lic["license"]["id"]
        s, d = req("GET", "/api/master/subscriptions", headers=MK)
        check("subscriptions show license", s == 200 and d["subscriptions"][0]["license"] is not None, d)
        s, d = req("GET", "/api/master/tenants/tenant_demo/devices", headers=MK)
        check("master devices", s == 200 and len(d["devices"]) >= 1, d)
        s, d = req("POST", "/api/master/tenants/tenant_demo/domains", {"hostname": "gate.example.com"}, headers=MK)
        check("master domain add", s == 201, d)
        s, d = req("POST", "/api/master/tenants/tenant_demo/note", {"note": "Gate note."}, headers=MK)
        check("master support note", s == 200, d)
        s, ann = req("POST", "/api/master/announcements", {"title": "Gate announcement", "body": "Hello tenants."}, headers=MK)
        check("master announcement", s == 201, ann)
        s, d = req("GET", "/api/announcements", headers=H)
        check("tenant sees announcement", s == 200 and any(a["id"] == ann["announcement"]["id"] for a in d["announcements"]), d)
        s, d = req("GET", "/api/master/tenants/tenant_demo/export", headers=MK)
        check("tenant export", s == 200 and d["format"] == "mbi-inventra-tenant-export-v1", d)

        # License enforcement LAST (it blocks logins while suspended)
        s, d = req("POST", f"/api/master/licenses/{lic_id}/suspend", {}, headers=MK)
        check("license suspend", s == 200, d)
        s, d = req("POST", "/api/auth/login", {"login": "owner", "password": "demo12345", "deviceName": "Gate device"})
        check("login blocked while suspended 423", s == 423, d)
        s, d = req("POST", f"/api/master/licenses/{lic_id}/reactivate", {}, headers=MK)
        check("license reactivate", s == 200, d)
        s, d = req("POST", "/api/auth/login", {"login": "owner", "password": "demo12345", "deviceName": "Gate device"})
        check("login works after reactivate", s == 200, d)
        s, d = req("POST", f"/api/master/licenses/{lic_id}/revoke", {}, headers=MK)
        check("license revoke", s == 200, d)

        print("FAILURES:", fails)
        return 1 if fails else 0
    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
