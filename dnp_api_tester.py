#!/usr/bin/env python3
"""
DNP - automatic API tester
==========================
Tests every API of the running DNP application and writes an Excel report.

What it does
  1. Reads the list of APIs from the running app (Swagger: /v3/api-docs).
  2. GENERIC tests for every table API (about 100 controllers):
       POST valid (201), POST empty body (400), GET by id (200), GET unknown id (404),
       GET list (200), GET page (200 + X-Total-Count), GET with filter (200),
       PUT partial update (200), PUT with an old version (409); DELETE only with --cleanup.
     Valid bodies are built from the API description (required fields, max lengths, allowed values,
     min/max) and the ids of other tables are created automatically (e.g. a distributor needs a region).
  3. BUSINESS FLOW tests: login / roles, stock ledger, product-code verification, dispatch with handover
     code, delivery receipt with discrepancy + ticket, ticket lifecycle + evidence file, expired-stock
     return, exchange, order status, commitments, health score, recovery plan, analytics, exports,
     jobs, dashboard, audit log, notifications.
  3b. EXTRA checks: every role against the permission matrix (Sales / Finance / Recovery Manager, Manufacturer,
     Distributor, Suspended user), distributor A cannot see or change distributor B's data, LOW_STOCK and
     NEAR_EXPIRY alerts (no duplicates), Recovery Mode opened automatically, exact numbers for credit risk /
     emission / health score, audit row of a create, paging/sort/size limits, 5 MB upload limit, request id,
     two users updating the same row at the same time.
     With --db (PostgreSQL URL, needs psycopg2-binary): SLA escalation of an overdue ticket, old plain-text
     password upgraded to BCrypt at login, database refuses a negative stock quantity.
  4. Writes  dnp_api_test_report_<date-time>.xlsx  (or .csv when openpyxl is missing) with one row per call.

How to run (on the computer where the application is running)
  pip install requests openpyxl
  python dnp_api_tester.py
  python dnp_api_tester.py --url http://localhost:8081 --user admin@dnp.local --password Admin@12345
  python dnp_api_tester.py --only generic      (or --only flows)
  python dnp_api_tester.py --cleanup           (also delete the test rows at the end)
  pip install psycopg2-binary
  python dnp_api_tester.py --db postgresql://postgres:1234@localhost:5432/Distributor_Network_Performance_db

Use a TEST database: the script creates many rows and KEEPS them (so you can look at them afterwards).
"""
import argparse
import csv
import datetime as dt
import io
import json
import random
import re
import string
import sys
import time
import traceback

try:
    import requests
except ImportError:
    print("Please install requests first:  pip install requests openpyxl")
    sys.exit(1)

TODAY = dt.date.today()
RUN = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
results = []


# ----------------------------------------------------------------------------------------------- helpers

def rnd(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def ean13(first12=None):
    if first12 is None:
        first12 = "2" + "".join(random.choices(string.digits, k=11))
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(first12))
    return first12 + str((10 - s % 10) % 10)


def short(text, n=300):
    text = "" if text is None else str(text)
    return text if len(text) <= n else text[:n] + "..."


def as_list(resp):
    """Response body as a list of dicts ([] for errors or other shapes)."""
    b = body_of(resp) if getattr(resp, "status_code", 0) == 200 else None
    return [x for x in b if isinstance(x, dict)] if isinstance(b, list) else []


def body_of(resp):
    try:
        return resp.json()
    except Exception:
        return None


class Api:
    def __init__(self, base, user, password, timeout=30):
        self.base = base.rstrip("/")
        self.auth = (user, password) if user else None
        self.timeout = timeout
        self.s = requests.Session()

    def call(self, method, path, json_body=None, params=None, auth="default", files=None, headers=None):
        url = path if path.startswith("http") else self.base + path
        a = self.auth if auth == "default" else auth
        try:
            return self.s.request(method, url, json=json_body, params=params, auth=a, files=files,
                                  headers=headers, timeout=self.timeout)
        except requests.RequestException as e:
            class Fake:
                status_code = 0
                text = f"connection error: {e}"
                headers = {}
                content = b""

                def json(self):
                    raise ValueError()
            return Fake()


def record(area, test, method, path, expected, resp, note=""):
    """expected: int, tuple of ints. Returns True when the status matched."""
    exp = expected if isinstance(expected, (tuple, list)) else (expected,)
    code = resp.status_code if resp is not None else 0
    ok = code in exp
    detail = note
    if resp is not None and not ok:
        b = body_of(resp)
        if isinstance(b, dict):
            detail = (note + " | " if note else "") + short(b.get("message") or b.get("error") or b, 250)
            if b.get("fieldErrors"):
                detail += " | fields: " + short(b.get("fieldErrors"), 200)
        else:
            detail = (note + " | " if note else "") + short(getattr(resp, "text", ""), 250)
    results.append({"area": area, "test": test, "method": method, "path": path,
                    "expected": "/".join(map(str, exp)), "actual": code,
                    "result": "PASS" if ok else "FAIL", "detail": detail})
    return ok


def info(area, test, detail, result="INFO"):
    results.append({"area": area, "test": test, "method": "", "path": "", "expected": "", "actual": "",
                    "result": result, "detail": short(detail, 400)})


# ----------------------------------------------------------------------------------------------- OpenAPI model

class Spec:
    def __init__(self, doc):
        self.doc = doc
        self.schemas = doc.get("components", {}).get("schemas", {})
        self.resources = {}      # collection path -> resource dict
        self.by_id_field = {}    # e.g. "distributorId" -> collection path
        self._build()

    def schema(self, ref_or_schema):
        if not ref_or_schema:
            return {}
        if "$ref" in ref_or_schema:
            return self.schemas.get(ref_or_schema["$ref"].split("/")[-1], {})
        return ref_or_schema

    def _build(self):
        paths = self.doc.get("paths", {})
        for p, ops in paths.items():
            if "{" in p or "post" not in ops or not p.startswith("/api/v1/"):
                continue
            rb = ops["post"].get("requestBody", {}).get("content", {})
            media = rb.get("application/json") or next(iter(rb.values()), None) if rb else None
            if not media or "$ref" not in media.get("schema", {}):
                continue
            name = media["schema"]["$ref"].split("/")[-1]
            if not name.endswith("DTO"):
                continue
            sch = self.schemas.get(name, {})
            props = sch.get("properties", {})
            id_field = next((k for k, v in props.items() if v.get("readOnly") and k.endswith("Id")), None)
            client_id = False
            if id_field is None and "userId" in props:
                id_field, client_id = "userId", True
            one = p + "/{id}"
            alt = next((q for q in paths if q.startswith(p + "/{") and q.count("/") == p.count("/") + 1), one)
            item_ops = paths.get(alt, {})
            self.resources[p] = {"path": p, "item": alt, "schema": name, "props": props,
                                 "required": set(sch.get("required", [])), "id": id_field,
                                 "client_id": client_id,
                                 "put": "put" in item_ops, "delete": "delete" in item_ops,
                                 "get_list": "get" in ops}
        for p, r in sorted(self.resources.items(), key=lambda kv: (kv[0].count("/"), len(kv[0]))):
            if r["id"] and not r["client_id"] and r["id"] not in self.by_id_field:
                self.by_id_field[r["id"]] = p
        # helpful aliases
        for alias, target in {"ownerDistributorId": "distributorId", "parentCategoryId": "categoryId",
                              "targetWarehouseId": "warehouseId", "destinationWarehouseId": "warehouseId",
                              "sourceWarehouseStockId": "warehouseStockId", "recoveryStatusId": "recoveryStatusId",
                              "creditLimitId": "creditLimitId"}.items():
            if target in self.by_id_field and alias not in self.by_id_field:
                self.by_id_field[alias] = self.by_id_field[target]

    def path_for_schema(self, schema_name):
        best = [p for p, r in self.resources.items() if r["schema"] == schema_name]
        return sorted(best, key=lambda x: (x.count("/"), len(x)))[0] if best else None



# ----------------------------------------------------------------------------------------------- realistic sample data
# Invented business names only (no brands, no real companies). Places are real Indian cities and states.

FIRST = ["Arjun", "Priya", "Karthik", "Divya", "Suresh", "Lakshmi", "Vignesh", "Meena", "Rahul", "Anitha", "Prakash",
         "Revathi", "Senthil", "Kavya", "Manoj", "Deepa", "Harish", "Swathi", "Ganesh", "Nithya", "Aravind", "Bhavana"]
LAST = ["Raman", "Krishnan", "Subramanian", "Iyer", "Nair", "Reddy", "Sharma", "Pillai", "Menon", "Rao", "Natarajan",
        "Shankar", "Gupta", "Joseph", "Fernandes", "Das", "Patel", "Kumar", "Varma", "Chandran"]
CITIES = [("Chennai", "Tamil Nadu", "600"), ("Coimbatore", "Tamil Nadu", "641"), ("Madurai", "Tamil Nadu", "625"),
          ("Salem", "Tamil Nadu", "636"), ("Tiruchirappalli", "Tamil Nadu", "620"), ("Bengaluru", "Karnataka", "560"),
          ("Mysuru", "Karnataka", "570"), ("Hyderabad", "Telangana", "500"), ("Kochi", "Kerala", "682"),
          ("Visakhapatnam", "Andhra Pradesh", "530"), ("Pune", "Maharashtra", "411"), ("Ahmedabad", "Gujarat", "380")]
STREETS = ["Gandhi Road", "Nehru Street", "Market Road", "Station Road", "Temple Street", "Main Bazaar", "Industrial Estate",
           "Ring Road", "Lake View Road", "Anna Salai", "MG Road", "Bypass Road"]
BIZ_WORDS = ["Amudhan", "Sevalan", "Ilavan", "Maruthan", "Vanyar", "Kirathi", "Neyara", "Thiran", "Ezhil", "Kalvar",
             "Nalvar", "Poorvik", "Sindhar", "Velan", "Aranya", "Tejan"]
BIZ_TYPES = ["Agencies", "Distributors", "Traders", "Wholesale", "Enterprises", "Marketing", "Supply Company", "Stores"]
MFG_TYPES = ["Foods", "Agro Products", "Consumer Products", "Industries", "Home Care", "Beverages"]
PRODUCTS = ["Basmati rice 5 kg bag", "Sunflower oil 1 L pouch", "Toor dal 1 kg", "Tea powder 250 g", "Wheat flour 10 kg",
            "Detergent powder 1 kg", "Toothpaste 150 g", "Bath soap 100 g pack of 4", "Iodised salt 1 kg", "Sugar 5 kg",
            "Coffee powder 200 g", "Glucose biscuits 200 g", "Coconut oil 500 ml", "Dishwash bar 300 g", "Turmeric powder 100 g"]
WORDS_BY_FIELD = {
    "statusname": ["Pending", "Approved", "In Progress", "On Hold", "Under Review", "Completed", "Submitted", "Verified"],
    "rolename": ["Regional Supervisor", "Sales Executive", "Accounts Officer", "Field Auditor", "Warehouse Lead", "Area Manager"],
    "departmentname": ["Finance", "Sales", "Operations", "Logistics", "Customer Support", "Audit", "Supply Chain"],
    "categoryname": ["Grocery", "Personal Care", "Home Care", "Beverages", "Snacks", "Dairy", "Staples", "Spices"],
    "parametername": ["Payment discipline", "Order regularity", "Stock availability", "Market coverage", "Claim settlement time",
                      "Display compliance", "Returns ratio"],
    "activitytypename": ["Store visit", "Phone follow-up", "Stock audit", "Training session", "Promotion setup", "Review meeting"],
    "movementtypename": ["Goods receipt", "Dispatch to distributor", "Inter-warehouse transfer", "Stock adjustment"],
    "vehiclename": ["Light truck 3 tonne", "Medium truck 7 tonne", "Mini van", "Container truck 20 ft", "Three-wheeler cargo"],
    "methodname": ["UPI", "NEFT", "RTGS", "Cheque", "Cash", "Debit card"],
    "unitname": ["Kilogram", "Litre", "Carton", "Piece", "Bag", "Box"],
    "typename": ["Stock alert", "Order update", "Payment reminder", "Ticket update", "Shipment update"],
    "documenttypename": ["Goods receipt note", "Delivery challan", "Stock transfer note", "Adjustment voucher"],
    "prioritiyname": ["Low", "Medium", "High", "Critical"], "priorityname": ["Low", "Medium", "High", "Critical"],
    "levelname": ["Low", "Moderate", "High", "Critical"], "risklevelname": ["Low", "Moderate", "High", "Critical"],
    "riskcategory": ["Low risk", "Medium risk", "High risk"], "bandname": ["Low risk", "Medium risk", "High risk"],
    "reportname": ["Monthly sales summary", "Outstanding invoices", "Stock ageing", "Distributor health review"],
    "module": ["Sales", "Finance", "Inventory", "Recovery", "Distributor"],
    "filtername": ["Region", "Distributor", "Date range", "Product category"],
    "filtervalue": ["South", "Chennai", "Last 30 days", "Grocery"],
    "targetname": ["Sell 500 cartons of staples", "Open 10 new retail outlets", "Clear dues within 30 days",
                   "Increase beverage sales by 15%"],
    "title": ["Collect first instalment of dues", "Clear 50% of overdue invoices", "Restart regular weekly orders"],
    "subject": ["Short delivery of 2 cartons", "Damaged packaging on arrival", "Invoice amount mismatch",
                "Shipment delayed by 3 days", "Wrong product variant delivered"],
    "description": ["Distributor reported that two cartons were missing from the consignment received this morning.",
                    "Outer cartons were torn and three packs were wet when the goods were unloaded.",
                    "The invoice total does not match the agreed price list for this month.",
                    "Regular supplier for the northern zone, serving about 120 retail outlets."],
    "remarks": ["Checked with the warehouse team", "Follow up in the next review meeting", "Confirmed by the area manager",
                "Customer informed by phone"],
    "reason": ["Goods damaged in transit", "Customer requested an urgent top-up", "Batch close to expiry",
               "Duplicate order placed by mistake"],
    "message": ["Stock for the batch is below the reorder level", "Your order has been dispatched", "Payment received, thank you"],
    "comment": ["Called the distributor, waiting for photos of the damage", "Replacement scheduled with the next shipment"],
    "commenttext": ["Called the distributor, waiting for photos of the damage", "Replacement scheduled with the next shipment"],
    "findings": ["Packing list was not checked before loading"], "correctiveaction": ["Second check added at the loading bay"],
    "origin": [c[0] for c in CITIES], "destination": [c[0] for c in CITIES], "city": [c[0] for c in CITIES],
    "state": [c[1] for c in CITIES], "country": ["India"], "currency": ["INR"], "fueltype": ["Diesel", "CNG", "Electric"],
    "admin level": ["Super Admin"], "adminlevel": ["Super Admin", "Standard"], "periodtype": ["Monthly", "Quarterly"],
    "format": ["PDF", "XLSX", "CSV"], "unit": ["kg CO2/km"], "action": ["CREATE"],
}


def person():
    return f"{random.choice(FIRST)} {random.choice(LAST)}"


def business(kind="distributor"):
    c = random.choice(CITIES)[0]
    t = random.choice(MFG_TYPES if kind == "manufacturer" else BIZ_TYPES)
    return f"{random.choice(BIZ_WORDS)} {t}, {c}"


def email_for(name=None):
    n = (name or person()).lower().split()
    return f"{n[0]}.{n[-1]}{random.randint(10, 9999)}@example.com"


def phone():
    return random.choice("6789") + "".join(random.choices(string.digits, k=9))


def address():
    c = random.choice(CITIES)
    return f"{random.randint(1, 250)}, {random.choice(STREETS)}, {c[0]}, {c[1]} - {c[2]}{random.randint(1, 99):03d}"


def realistic(name, mx):
    """A realistic text value for a field, from its name (falls back to a short code)."""
    n = name.lower()
    year = TODAY.year
    val = None
    if n in WORDS_BY_FIELD:
        val = random.choice(WORDS_BY_FIELD[n])
    elif "email" in n:
        val = email_for()
    elif "phone" in n or "mobile" in n:
        val = phone()
    elif "address" in n:
        val = address()
    elif n in ("username", "contactperson", "fullname", "assigneename") or n.endswith("person"):
        val = person()
    elif n.startswith("distributor") and n.endswith("name"):
        val = business()
    elif n.startswith("manufacturer") and n.endswith("name"):
        val = business("manufacturer")
    elif n in ("productname", "itemname"):
        val = random.choice(PRODUCTS)
    elif n == "sku":
        val = f"SKU-{random.randint(100000, 999999)}"
    elif n.startswith("warehouse") and n.endswith("name"):
        val = f"{random.choice(CITIES)[0]} {random.choice(['Central Warehouse', 'Depot', 'Distribution Centre', 'Godown'])} {random.randint(1, 9)}"
    elif n.startswith("region") and n.endswith("name"):
        val = f"{random.choice(CITIES)[1]} {random.choice(['North', 'South', 'East', 'West', 'Central'])}"
    elif n == "periodname":
        val = TODAY.strftime("%B %Y")
    elif n == "invoicenumber":
        val = f"INV-{year}-{random.randint(10000, 99999)}"
    elif n == "ordernumber":
        val = f"ORD-{year}-{random.randint(10000, 99999)}"
    elif n == "documentnumber":
        val = f"DOC-{year}-{random.randint(10000, 99999)}"
    elif n == "batchnumber":
        val = f"BT{TODAY:%y%m}-{random.randint(1000, 9999)}"
    elif n == "trackingnumber":
        val = f"TRK{random.randint(1000000000, 9999999999)}"
    elif n in ("transactionreference", "referencenumber", "paymentreference"):
        val = f"TXN{random.randint(10**11, 10**12 - 1)}"
    elif n.endswith("code"):
        val = "".join(random.choices(string.ascii_uppercase, k=3)) + str(random.randint(100, 999))
    elif n == "configkey":
        val = f"custom.{random.choice(['report', 'alert', 'stock', 'sales'])}.{random.choice(['days', 'limit', 'level'])}{random.randint(1, 999)}"
    elif n == "configvalue":
        val = str(random.choice([7, 15, 30, 60, 90]))
    elif n == "filename":
        val = f"delivery_photo_{random.randint(1000, 9999)}.jpg"
    elif n.endswith("name"):
        val = f"{random.choice(['Standard', 'Regular', 'Premium', 'Seasonal', 'Priority', 'General'])} {random.choice(['plan', 'type', 'class', 'group'])} {random.randint(1, 99)}"
    elif n.endswith("password") or n == "passwordhash":
        val = "Welcome@2026"
    else:
        val = random.choice(WORDS_BY_FIELD["remarks"])
    if len(val) > mx:
        val = val[:mx] if mx >= 8 else "".join(random.choices(string.ascii_uppercase + string.digits, k=mx))
    return val


def realistic_number(name, t):
    n = name.lower()
    pick = {
        "quantity": lambda: random.randint(5, 40), "requestedquantity": lambda: random.randint(2, 10),
        "unitprice": lambda: round(random.uniform(35, 950), 2), "unitcost": lambda: round(random.uniform(20, 600), 2),
        "invoiceamount": lambda: random.randint(20000, 90000), "amount": lambda: random.randint(1500, 15000),
        "creditlimit": lambda: random.choice([150000, 250000, 500000, 750000]),
        "targetvalue": lambda: random.choice([50000, 120000, 250000]), "progressvalue": lambda: random.randint(1000, 20000),
        "targetamount": lambda: random.choice([50000, 100000, 200000]), "achievedamount": lambda: 0,
        "recognizedamount": lambda: random.randint(5000, 60000), "distancekm": lambda: random.randint(40, 450),
        "factorvalue": lambda: round(random.uniform(0.15, 0.95), 3), "score": lambda: random.randint(45, 95),
        "riskscore": lambda: random.randint(20, 75), "reorderlevel": lambda: random.choice([10, 20, 25, 50]),
        "thresholdvalue": lambda: 50, "weight": lambda: 0.05, "minimumscore": lambda: 0, "maximumscore": lambda: 100,
        "severityrank": lambda: random.randint(1, 4), "responsehours": lambda: random.choice([2, 4, 8]),
        "resolutionhours": lambda: random.choice([24, 48, 72]), "escalationlevel": lambda: 1, "totalscore": lambda: 70,
        "verifiedquantity": lambda: 5, "sizebytes": lambda: 2048, "sequencenumber": lambda: random.randint(1, 90),
        "capacity": lambda: random.choice([5000, 10000, 25000]),
    }
    v = pick[n]() if n in pick else random.randint(1, 20)
    return float(v) if t == "number" else int(v)

# ----------------------------------------------------------------------------------------------- body builder

DATE_PAST = re.compile(r"(validFrom|startDate|onboardingDate|manufactureDate|activityDate|invoiceDate|orderDate|"
                       r"paymentDate|saleDate|documentDate|dispatchDate|assessmentDate|periodStart|fromDate)$", re.I)
NUM_OVERRIDE = {
    "weight": 0.05, "score": 70, "quantity": 5, "requestedQuantity": 2, "amount": 10, "invoiceAmount": 5000,
    "factorValue": 0.25, "distanceKm": 120, "riskScore": 40, "minimumScore": 0, "maximumScore": 100,
    "reorderLevel": 1, "creditLimit": 100000, "targetValue": 1000, "progressValue": 10, "unitPrice": 50,
    "unitCost": 20, "thresholdValue": 50, "severityRank": 1, "responseHours": 4, "resolutionHours": 24,
    "escalationLevel": 1, "totalScore": 70, "recognizedAmount": 1000, "targetAmount": 50000,
    "achievedAmount": 0, "verifiedQuantity": 5, "sizeBytes": 10, "adminLevel": None,
}
STR_OVERRIDE = {
    "movementDirection": "IN", "status": "Active", "ipAddress": "127.0.0.1", "passwordHash": "Welcome@2026",
    "phone": "9876543210", "currency": "INR", "fuelType": "Diesel", "stockType": "STOCK_SELL",
    "unit": "kg CO2/km", "format": "PDF", "adminLevel": "Super Admin", "action": "CREATE",
}


def ptype(prop):
    t = prop.get("type")
    if isinstance(t, list):
        t = next((x for x in t if x != "null"), None)
    if t is None and prop.get("types"):
        t = next((x for x in prop["types"] if x != "null"), None)
    return t


def value_for(spec, name, prop, ctx):
    t = ptype(prop)
    fmt = prop.get("format", "")
    enum = prop.get("enum")
    if enum:
        return enum[0]
    pattern = prop.get("pattern")
    if t == "string" and fmt == "date":
        return str(TODAY - dt.timedelta(days=1) if DATE_PAST.search(name) else TODAY + dt.timedelta(days=60))
    if t == "string" and fmt == "date-time":
        return dt.datetime.now().astimezone().replace(microsecond=0).isoformat()
    if t == "boolean":
        return False if name.lower().startswith("isterminal") else True
    if t in ("integer", "number"):
        v = realistic_number(name, t)
        mx = prop.get("maximum")
        mn = prop.get("minimum")
        if mx is not None and v > float(mx):
            v = float(mx) / 2 if t == "number" else int(mx)
        if mn is not None and v < float(mn):
            v = mn
        return v
    if t == "string":
        mx = int(prop.get("maxLength", 60))
        if name in ("productCode", "enteredCode") or (pattern and "\\d{13}" in pattern):
            return ean13()
        if pattern and "|" in pattern and re.fullmatch(r"[\w |.-]+", pattern):
            return pattern.split("|")[0]
        if name in ("movementDirection", "status", "stockType", "ipAddress"):
            return {"movementDirection": "IN", "status": "Active", "stockType": "STOCK_SELL",
                    "ipAddress": f"192.168.1.{random.randint(2, 250)}"}[name][:mx]
        if fmt == "email":
            return email_for()[:mx]
        if pattern:   # a format rule (e.g. phone): use the first realistic value that matches it
            for cand in (realistic(name, mx), phone(), email_for(), f"+91 {phone()}", str(random.randint(100000, 999999)), str(random.randint(1000000, 9999999)),
                         "".join(random.choices(string.ascii_uppercase, k=3)) + str(random.randint(100, 999))):
                try:
                    if re.fullmatch(pattern, cand) and len(cand) <= mx:
                        return cand
                except re.error:
                    break
            return realistic(name, mx)
        return realistic(name, mx)
    if t == "array":
        return []
    return None


class Builder:
    def __init__(self, api, spec, me_id):
        self.api, self.spec, self.me = api, spec, me_id
        self.cache = {}          # collection path -> created row (dict)
        self.created = []        # (collection path, item path, id) in creation order
        self.busy = set()

    def body(self, res, overrides=None, fresh=False):
        b = {}
        for name, prop in res["props"].items():
            if prop.get("readOnly") or name == "version":
                continue
            if name == res["id"] and res["client_id"]:
                b[name] = self.new_user_id()
                continue
            if name.endswith("Id"):
                target = self.spec.by_id_field.get(name)
                if target and target != res["path"]:
                    row = self.fresh_row(target) if fresh else self.ensure(target)
                    if row is not None:
                        b[name] = row.get(self.spec.resources[target]["id"])
                    continue
                if name == "userId":
                    b[name] = self.me
                    continue
                if name not in res["required"]:
                    continue
            if name.endswith("By") or name in ("escalatedTo", "assignedTo", "changedBy", "receivedBy"):
                b[name] = self.me
                continue
            v = value_for(self.spec, name, self.spec.schema(prop), b)
            if v is not None:
                b[name] = v
        if overrides:
            b.update(overrides)
        return b

    def new_user_id(self):
        users = self.spec.path_for_schema("AppUserDTO")
        if not users:
            return self.me
        r = self.api.call("POST", users, (lambda n: {"email": email_for(n), "userName": n, "passwordHash": "Welcome@2026", "phone": phone(), "status": "Active"})(person()))
        b = body_of(r) or {}
        if r.status_code == 201:
            self.created.append((users, self.spec.resources[users]["item"], b.get("userId")))
        return b.get("userId", self.me)

    def fresh_row(self, path):
        row, _, _ = self.create(path)
        return row if row is not None else self.ensure(path)

    def create(self, path, overrides=None, area="setup", fresh=False):
        res = self.spec.resources[path]
        body = self.body(res, overrides, fresh)
        r = self.api.call("POST", path, body)
        if r.status_code == 201:
            row = body_of(r) or {}
            self.created.append((path, res["item"], row.get(res["id"])))
            return row, r, body
        return None, r, body

    def ensure(self, path):
        if not path or path not in self.spec.resources:
            return None
        if path in self.cache:
            return self.cache[path]
        if path in self.busy:
            return None
        self.busy.add(path)
        try:
            row, r, body = self.create(path)
            if row is None:   # fall back to any existing row
                lr = self.api.call("GET", path, params={"page": 0, "size": 1})
                rows = body_of(lr) if lr.status_code == 200 else None
                row = rows[0] if isinstance(rows, list) and rows else None
                if row is None:
                    info("setup", f"could not create {path}", f"{r.status_code}: {short(r.text, 300)} body={short(json.dumps(body), 300)}", "WARN")
            self.cache[path] = row
            return row
        finally:
            self.busy.discard(path)


def item_url(res, ident):
    return re.sub(r"\{[^}]+\}", str(ident), res["item"], count=1)


# ----------------------------------------------------------------------------------------------- generic tests

# rows the generic test needs to look different (e.g. weights in a future period, so they never push today's total over 100 %)
FAR = lambda d: str(TODAY + dt.timedelta(days=d))
def _old_day():
    d = str(dt.date(1995, 1, 1) + dt.timedelta(days=random.randint(0, 7000)))
    return {"validFrom": d, "validTo": d}     # a single day long ago: never overlaps today's weights


GENERIC_OVERRIDES = {"/api/v1/health-parameter-weights": _old_day}

GENERIC_SKIP_CREATE = {"/api/v1/stock-write-offs", "/api/v1/product-returns", "/api/v1/inventory-movements",
                       "/api/v1/exchange-requests"}


def generic_tests(api, spec, builder):
    area = "generic"
    for path in sorted(spec.resources):
        res = spec.resources[path]
        name = path.replace("/api/v1/", "")
        if path in GENERIC_SKIP_CREATE:
            r = api.call("GET", path)
            record(area, f"{name}: list (create tested in flows)", "GET", path, 200, r)
            continue
        ov = GENERIC_OVERRIDES[path]() if path in GENERIC_OVERRIDES else None
        row, r, body = builder.create(path, ov)
        if row is None and r.status_code == 409:
            row, r, body = builder.create(path, ov, fresh=True)
        if not record(area, f"{name}: create valid", "POST", path, 201, r, note="body=" + short(json.dumps(body), 200)):
            builder.cache.setdefault(path, None)
            lr = api.call("GET", path)
            record(area, f"{name}: list", "GET", path, 200, lr)
            continue
        builder.cache.setdefault(path, row)
        ident = row.get(res["id"])
        if res["required"] - {"version"}:
            record(area, f"{name}: create with empty body -> 400", "POST", path, 400, api.call("POST", path, {}))
        record(area, f"{name}: get by id", "GET", item_url(res, ident), 200, api.call("GET", item_url(res, ident)))
        record(area, f"{name}: get unknown id -> 404", "GET", item_url(res, 987654321), 404,
               api.call("GET", item_url(res, 987654321)))
        record(area, f"{name}: list", "GET", path, 200, api.call("GET", path))
        pr = api.call("GET", path, params={"page": 0, "size": 5})
        ok = record(area, f"{name}: list page 0 size 5", "GET", path + "?page=0&size=5", 200, pr)
        if ok and "X-Total-Count" not in pr.headers:
            info(area, f"{name}: X-Total-Count header missing", "paged list did not return X-Total-Count", "WARN")
        text_field = next((k for k, v in res["props"].items() if ptype(v) == "string" and not v.get("readOnly")
                           and not v.get("format") and not v.get("pattern") and k in body and not k.endswith("Id")), None)
        if text_field:
            fr = api.call("GET", path, params={text_field: str(body[text_field])[:6]})
            record(area, f"{name}: filter by {text_field}", "GET", f"{path}?{text_field}=...", 200, fr)
        record(area, f"{name}: filter by unknown field -> 400", "GET", path + "?noSuchField=1", 400,
               api.call("GET", path, params={"noSuchField": "1"}))
        if res["put"]:
            current = body_of(api.call("GET", item_url(res, ident))) or row
            version = current.get("version", row.get("version", 0))
            upd = {"version": version}
            if text_field:
                upd[text_field] = realistic(text_field, int(res["props"][text_field].get("maxLength", 60)))
            ur = api.call("PUT", item_url(res, ident), upd)
            if record(area, f"{name}: update (partial)", "PUT", item_url(res, ident), 200, ur):
                new_version = (body_of(ur) or {}).get("version", version)
                if new_version == version:
                    # nothing changed (no editable text field), so the version did not move: send a version that is too old
                    stale_version = version - 1 if isinstance(version, int) and version > 0 else 987654
                else:
                    stale_version = version
                stale = api.call("PUT", item_url(res, ident), {"version": stale_version})
                record(area, f"{name}: update with old version -> 409", "PUT", item_url(res, ident), 409, stale)
        if res["delete"]:
            delete_test(api, builder, path, res, name)


PROTECTED_DELETE = {"/api/v1/tickets": 422}   # tickets are kept for the audit trail


def delete_test(api, builder, path, res, name):
    """Creates an extra row only to delete it, so the main test data stays in the database."""
    area = "generic"
    ov = GENERIC_OVERRIDES[path]() if path in GENERIC_OVERRIDES else None
    extra, r, body = builder.create(path, ov)
    if extra is None and r.status_code == 409:   # a linked row must be unique: try again with new linked rows
        extra, r, body = builder.create(path, ov, fresh=True)
    if extra is None:
        record(area, f"{name}: delete (extra row could not be created)", "POST", path, 201, r)
        return
    ident = extra.get(res["id"])
    builder.created.pop()   # not part of the kept data
    want = PROTECTED_DELETE.get(path, 204)
    record(area, f"{name}: delete" + (" refused (protected)" if want != 204 else ""), "DELETE", item_url(res, ident), want,
           api.call("DELETE", item_url(res, ident)))
    if want == 204:
        record(area, f"{name}: get after delete -> 404", "GET", item_url(res, ident), 404, api.call("GET", item_url(res, ident)))
    record(area, f"{name}: delete unknown id -> 404", "DELETE", item_url(res, 987654321), 404,
           api.call("DELETE", item_url(res, 987654321)))


def id_field_of(spec, item_path, sample):
    """Name of the id field returned by GET item_path (the read-only ...Id of its response schema)."""
    try:
        content = spec.doc["paths"][item_path]["get"]["responses"]["200"]["content"]
        props = spec.schema(next(iter(content.values()))["schema"]).get("properties", {})
        key = next((k for k, v in props.items() if v.get("readOnly") and k.endswith("Id")), None)
        if key and sample.get(key) is not None:
            return key
    except (KeyError, StopIteration, AttributeError):
        pass
    var = re.search(r"\{(\w+)\}", item_path)
    if var and var.group(1) in sample:
        return var.group(1)
    return next((k for k, v in sample.items() if k.endswith("Id") and v is not None), None)


def generic_readonly_lists(api, spec):
    """GET-only APIs (views, histories) that have no POST."""
    for p, ops in spec.doc.get("paths", {}).items():
        if p.startswith("/api/v1/") and "{" not in p and "get" in ops and p not in spec.resources and "post" not in ops:
            if any(x in p for x in ("/exports", "/jobs", "/auth", "/inventory-analytics", "/stocks", "/dashboard",
                                    "/performance", "/continuity", "/emissions", "/notifications/mine", "/products/validate-code",
                                    "/health-scores/weights")):
                continue
            lr = api_global.call("GET", p)
            record("generic", f"{p.replace('/api/v1/', '')}: list (read-only API)", "GET", p, 200, lr)
            item = next((q for q in spec.doc["paths"] if q.startswith(p + "/{") and q.count("/") == p.count("/") + 1), None)
            rows = body_of(lr) if lr.status_code == 200 else None
            if item and isinstance(rows, list):
                if rows and isinstance(rows[0], dict):
                    key = id_field_of(spec, item, rows[0])
                    if key:
                        u = re.sub(r"\{[^}]+\}", str(rows[0][key]), item, count=1)
                        record("generic", f"{p.replace('/api/v1/', '')}: get by id (read-only API)", "GET", u, 200, api_global.call("GET", u))
                u = re.sub(r"\{[^}]+\}", "987654321", item, count=1)
                record("generic", f"{p.replace('/api/v1/', '')}: get unknown id -> 404 (read-only API)", "GET", u, 404, api_global.call("GET", u))


def cleanup(api, builder):
    area = "cleanup"
    for path, item, ident in reversed(builder.created):
        if ident is None:
            continue
        res = builder.spec.resources.get(path)
        if not res or not res["delete"]:
            continue
        r = api.call("DELETE", item.replace(item[item.index("{"):item.index("}") + 1], str(ident)))
        code = r.status_code
        ok = code in (204, 404)
        results.append({"area": area, "test": f"delete {path.replace('/api/v1/', '')} {ident}", "method": "DELETE",
                        "path": path, "expected": "204", "actual": code,
                        "result": "PASS" if ok else ("WARN" if code in (409, 422) else "FAIL"),
                        "detail": "" if ok else short((body_of(r) or {}).get("message") if isinstance(body_of(r), dict) else r.text, 200)
                        + (" (expected: row is still used by another row or is protected by a business rule)" if code in (409, 422) else "")})


# ----------------------------------------------------------------------------------------------- flow tests

class Flow:
    def __init__(self, api, spec, builder, me):
        self.api, self.spec, self.b, self.me = api, spec, builder, me

    def p(self, schema):
        return self.spec.path_for_schema(schema)

    def make(self, schema, overrides=None, area="flow"):
        path = self.p(schema)
        if not path:
            info(area, f"no API for {schema}", "skipped", "WARN")
            return None
        row, r, body = self.b.create(path, overrides)
        if row is None:
            record(area, f"create {schema}", "POST", path, 201, r, note="body=" + short(json.dumps(body), 250))
        return row

    def full(self, schema, overrides):
        """A complete valid body for a table API (required ids filled), with some fields set by the test."""
        path = self.p(schema)
        return self.b.body(self.spec.resources[path], overrides) if path else overrides

    def ok(self, area, test, method, path, expected, body=None, params=None, auth="default", files=None):
        r = self.api.call(method, path, body, params=params, auth=auth, files=files)
        record(area, test, method, path, expected, r)
        return r

    # ------------------------------------------------------------------ security
    def security(self, password):
        area = "security"
        r = self.api.call("GET", "/api/v1/distributors", auth=None)
        if r.status_code == 200:
            info(area, "no login -> 401", "Got 200: security is switched off (dnp.security.enabled=false)", "WARN")
        else:
            record(area, "no login -> 401", "GET", "/api/v1/distributors", 401, r)
        record(area, "wrong password -> 401", "GET", "/api/v1/auth/me", 401,
               self.api.call("GET", "/api/v1/auth/me", auth=(self.api.auth[0], "wrong-password")))
        self.ok(area, "who am I", "GET", "/api/v1/auth/me", 200)
        self.ok(area, "login", "POST", "/api/v1/auth/login", 200)
        # a distributor user
        dist = self.b.ensure(self.p("DistributorDTO")) if self.p("DistributorDTO") else None
        du_path = self.p("DistributorUserDTO")
        if dist and du_path:
            dist_name = person()
            email = email_for(dist_name)
            users = self.p("AppUserDTO")
            ur = self.api.call("POST", users, {"email": email, "userName": dist_name, "passwordHash": "Dist@12345",
                                               "phone": phone(), "status": "Active"})
            if record(area, "create distributor login user", "POST", users, 201, ur):
                uid = body_of(ur)["userId"]
                self.b.created.append((users, self.spec.resources[users]["item"], uid))
                row, r, body = self.b.create(du_path, {"userId": uid, "distributorId": dist["distributorId"]})
                record(area, "link user to distributor", "POST", du_path, 201, r)
                da = (email, "Dist@12345")
                self.dist_user = {"email": email, "distributorId": dist["distributorId"], "password": "Dist@67890"}
                self.ok(area, "distributor: who am I", "GET", "/api/v1/auth/me", 200, auth=da)
                self.ok(area, "distributor: read products allowed", "GET", "/api/v1/products", 200, auth=da)
                self.ok(area, "distributor: create product refused", "POST", "/api/v1/products", 403,
                        {"productName": random.choice(PRODUCTS), "sku": f"SKU-{random.randint(100000, 999999)}"}, auth=da)
                self.ok(area, "distributor: audit log refused", "GET", "/api/v1/audit-logs", 403, auth=da)
                self.ok(area, "distributor: my notifications", "GET", "/api/v1/notifications/mine", 200, auth=da)
                cp = self.ok(area, "distributor: change password", "POST", "/api/v1/auth/change-password", (200, 204),
                             {"currentPassword": "Dist@12345", "newPassword": "Dist@67890"}, auth=da)
                if cp.status_code not in (200, 204, 401):
                    info(area, "change-password body", "check field names in Swagger (currentPassword/newPassword)", "WARN")
                rr = self.ok(area, "password reset request", "POST", "/api/v1/auth/password-reset/request", 200, {"email": email}, auth=None)
                tok = (body_of(rr) or {}).get("resetToken")
                if tok:
                    self.ok(area, "password reset confirm", "POST", "/api/v1/auth/password-reset/confirm", (200, 204),
                            {"token": tok, "newPassword": "Dist@24680"}, auth=None)
                    self.dist_user["password"] = "Dist@24680"
                    self.ok(area, "reset token used twice -> 422", "POST", "/api/v1/auth/password-reset/confirm", 422,
                            {"token": tok, "newPassword": "Dist@13579"}, auth=None)

    # ------------------------------------------------------------------ stock, verify, dispatch, delivery
    def stock_dispatch_delivery(self):
        area = "dispatch"
        code = ean13()
        product = self.make("ProductDTO", {"productCode": code, "unitCost": 20}, area)
        if not product:
            return
        self.ok(area, "validate a good code", "GET", "/api/v1/products/validate-code", 200, params={"code": code})
        bad = code[:-1] + str((int(code[-1]) + 1) % 10)
        r = self.api.call("GET", "/api/v1/products/validate-code", params={"code": bad})
        record(area, "validate a wrong code (valid=false)", "GET", "/api/v1/products/validate-code", 200, r)
        if r.status_code == 200 and (body_of(r) or {}).get("valid") is not False:
            info(area, "wrong code accepted", short(r.text), "FAIL")
        self.ok(area, "product by code", "GET", f"/api/v1/products/by-code/{code}", 200)
        batch = self.make("ProductBatchDTO", {"productId": product["productId"], "batchNumber": realistic("batchNumber", 100),
                                              "expiryDate": str(TODAY + dt.timedelta(days=200))}, area)
        wh = self.b.ensure(self.p("WarehouseDTO"))
        if not batch or not wh:
            return
        stock = self.make("WarehouseStockDTO", {"warehouseId": wh["warehouseId"], "productBatchId": batch["productBatchId"],
                                                "ownerDistributorId": None, "reorderLevel": 1}, area)
        if not stock:
            return
        sid = stock["warehouseStockId"]
        self.movement(area, sid, "IN", 100)
        cur = self.api.call("GET", "/api/v1/stocks/current", params={"warehouseId": wh["warehouseId"]})
        record(area, "current stock", "GET", "/api/v1/stocks/current", 200, cur)
        row = next((x for x in as_list(cur) if x.get("warehouseStockId") == sid), None)
        if not row or float(row.get("quantity") or 0) != 100:
            info(area, "stock quantity after IN 100", f"expected 100, got {row and row.get('quantity')}", "FAIL")
        self.movement(area, sid, "OUT", 1000, expect=422, label="OUT more than stock -> 422")
        self.ok(area, "stock summary", "GET", "/api/v1/stocks/summary", 200)
        # order -> shipment
        order = self.make("DistributorOrderDTO", {"orderNumber": realistic("orderNumber", 50)}, area)
        if not order:
            return
        oi = self.make("OrderItemDTO", {"orderId": order["orderId"], "productId": product["productId"], "quantity": 5, "unitPrice": 50}, area)
        ship = self.make("ShipmentDTO", {"warehouseId": wh["warehouseId"], "trackingNumber": realistic("trackingNumber", 50)}, area)
        if not oi or not ship:
            return
        si = self.make("ShipmentItemDTO", {"shipmentId": ship["shipmentId"], "orderItemId": oi["orderItemId"],
                                           "productBatchId": batch["productBatchId"], "quantity": 5}, area)
        if not si:
            return
        base = f"/api/v1/shipments/{ship['shipmentId']}"
        self.ok(area, "dispatch before verify -> 422", "POST", base + "/dispatch", 422, {})
        r = self.ok(area, "verify with a typing mistake", "POST", base + f"/items/{si['shipmentItemId']}/verify", 200,
                    {"productCode": bad, "batchNumber": batch["batchNumber"], "quantity": 5})
        if (body_of(r) or {}).get("result") != "MISMATCH":
            info(area, "typing mistake should be MISMATCH", short(r.text), "FAIL")
        r = self.ok(area, "verify correct code/batch/qty", "POST", base + f"/items/{si['shipmentItemId']}/verify", 200,
                    {"productCode": code, "batchNumber": batch["batchNumber"], "quantity": 5})
        if (body_of(r) or {}).get("result") != "MATCH":
            info(area, "correct entry should be MATCH", short(r.text), "FAIL")
        self.ok(area, "verification attempts", "GET", base + "/verifications", 200)
        d = self.ok(area, "dispatch", "POST", base + "/dispatch", 200, {"remarks": "Loaded and sealed at bay 3"})
        hcode = (body_of(d) or {}).get("handoverCode")
        self.ok(area, "dispatch twice -> 422", "POST", base + "/dispatch", 422, {})
        self.ok(area, "status history", "GET", base + "/status-history", 200)
        if not hcode:
            return
        conf = f"/api/v1/delivery-receipts/{ship['shipmentId']}/confirm"
        wrong = "000000" if hcode != "000000" else "111111"
        self.ok(area, "confirm with wrong handover code -> 422", "POST", conf, 422, {"handoverCode": wrong})
        r = self.ok(area, "confirm delivery (1 short)", "POST", conf, 201,
                    {"handoverCode": hcode, "remarks": "One carton short on arrival",
                     "items": [{"shipmentItemId": si["shipmentItemId"], "receivedQuantity": 4, "damagedQuantity": 0}]})
        disc = (body_of(r) or {}).get("discrepancies") or []
        if r.status_code == 201 and not disc:
            info(area, "shortage should create a discrepancy", short(r.text), "FAIL")
        elif disc and not disc[0].get("ticketId"):
            info(area, "discrepancy should have a ticket", short(json.dumps(disc)), "FAIL")
        self.ok(area, "confirm twice -> 409", "POST", conf, 409, {"handoverCode": hcode})
        self.ok(area, "receipt by shipment", "GET", f"/api/v1/delivery-receipts/by-shipment/{ship['shipmentId']}", 200)
        self.ok(area, "status change after delivery -> 422", "POST", base + "/status", 422, {"status": "In Transit"})
        # write-off
        self.ok(area, "write-off 2 units", "POST", "/api/v1/stock-write-offs", 201,
                self.full("StockWriteOffDTO", {"warehouseStockId": sid, "quantity": 2, "reason": "Packs broken while restacking the shelf"}))
        self.ok(area, "write-off more than stock -> 422", "POST", "/api/v1/stock-write-offs", 422,
                self.full("StockWriteOffDTO", {"warehouseStockId": sid, "quantity": 100000, "reason": "Write-off larger than the stock"}))
        self.stock_ctx = {"product": product, "batch": batch, "warehouse": wh, "stock": stock}

    def movement(self, area, stock_id, direction, qty, expect=201, label=None):
        mt_path, doc_path, mv_path = self.p("MovementTypeDTO"), self.p("InventoryDocumentDTO"), "/api/v1/inventory-movements"
        if not (mt_path and doc_path):
            return
        mt, r, _ = self.b.create(mt_path, {"movementTypeName": ("Goods receipt " if direction == "IN" else "Stock issue ") + str(random.randint(1, 999)), "movementDirection": direction})
        doc = self.b.ensure(doc_path)
        if not mt or not doc:
            record(area, "movement type", "POST", mt_path, 201, r)
            return
        r = self.api.call("POST", mv_path, {"inventoryDocumentId": doc["inventoryDocumentId"], "warehouseStockId": stock_id,
                                            "movementTypeId": mt["movementTypeId"], "quantity": qty,
                                            "movementDate": dt.datetime.now().astimezone().replace(microsecond=0).isoformat()})
        record(area, label or f"stock movement {direction} {qty}", "POST", mv_path, expect, r)
        if r.status_code == 201:
            mid = (body_of(r) or {}).get("movementId")
            self.ok(area, "movement cannot be changed -> 422", "PUT", f"{mv_path}/{mid}", 422, {"version": 0, "quantity": 1})

    # ------------------------------------------------------------------ tickets
    def tickets(self):
        area = "tickets"
        dist = self.b.ensure(self.p("DistributorDTO"))
        t = self.make("TicketDTO", {"distributorId": dist and dist.get("distributorId"), "subject": random.choice(WORDS_BY_FIELD["subject"]),
                                    "description": random.choice(WORDS_BY_FIELD["description"])}, area)
        if not t:
            return
        if not t.get("referenceNumber"):
            info(area, "ticket reference number", "missing on create", "FAIL")
        base = f"/api/v1/tickets/{t['ticketId']}"
        self.ok(area, "status via PUT refused -> 422", "PUT", base, (409, 422), {"version": t.get("version", 0), "ticketStatusId": 987654})
        self.ok(area, "status Open -> Closed refused -> 422", "POST", base + "/status", 422, {"status": "Closed"})
        self.ok(area, "status Open -> In Progress", "POST", base + "/status", 200, {"status": "In Progress", "remarks": "Looking into it with the warehouse team"})
        self.ok(area, "assign", "POST", base + "/assign", 200, {"assignedTo": self.me, "remarks": "Assigned to the regional recovery desk"})
        self.ok(area, "close before resolve -> 422", "POST", base + "/close", 422, {})
        self.ok(area, "resolve", "POST", base + "/resolve", 200, {"findings": "One carton was not loaded at the warehouse", "correctiveAction": "Missing carton sent with the next shipment"})
        self.ok(area, "close", "POST", base + "/close", 200, {"remarks": "Distributor confirmed receipt of the missing carton"})
        self.ok(area, "reopen", "POST", base + "/reopen", 200, {"reason": "Distributor says one pack is still missing"})
        self.ok(area, "escalate", "POST", base + "/escalate", 201, {"reason": "No update from the warehouse for two days"})
        files = {"file": ("delivery_note_scan.txt", io.BytesIO(b"Delivery note scan: 1 carton short, signed by the store keeper"), "text/plain")}
        up = self.api.call("POST", base + "/attachments", files=files)
        record(area, "upload evidence", "POST", base + "/attachments", 201, up)
        att = body_of(up) or {}
        if att.get("attachmentId"):
            self.ok(area, "download evidence", "GET", base + f"/attachments/{att['attachmentId']}/download", 200)
        bad = {"file": ("setup.exe", io.BytesIO(b"MZ"), "application/x-msdownload")}
        record(area, "upload not allowed type -> 400", "POST", base + "/attachments", 400,
               self.api.call("POST", base + "/attachments", files=bad))
        self.ok(area, "attachments", "GET", base + "/attachments", 200)
        self.ok(area, "history", "GET", base + "/history", 200)
        self.ok(area, "delete ticket refused -> 422", "DELETE", base, 422)

    # ------------------------------------------------------------------ expired stock return
    def returns(self):
        area = "returns"
        prod = self.make("ProductDTO", {"productCode": ean13(), "unitCost": 10}, area)
        dist = self.b.ensure(self.p("DistributorDTO"))
        wh = self.b.ensure(self.p("WarehouseDTO"))
        if not (prod and dist and wh):
            return
        batch = self.make("ProductBatchDTO", {"productId": prod["productId"], "batchNumber": realistic("batchNumber", 100),
                                              "manufactureDate": str(TODAY - dt.timedelta(days=400)),
                                              "expiryDate": str(TODAY - dt.timedelta(days=1))}, area)
        if not batch:
            info(area, "expired batch", "could not create a batch with a past expiry date (validation?)", "WARN")
            return
        stock = self.make("WarehouseStockDTO", {"warehouseId": wh["warehouseId"], "productBatchId": batch["productBatchId"],
                                                "ownerDistributorId": dist["distributorId"], "reorderLevel": 0}, area)
        if not stock:
            return
        self.movement(area, stock["warehouseStockId"], "IN", 10)
        j = self.ok(area, "run expiry-check job", "POST", "/api/v1/jobs/expiry-check/run", 200)
        info(area, "expiry-check result", short(j.text))
        lr = self.api.call("GET", "/api/v1/product-returns", params={"warehouseStockId": stock["warehouseStockId"]})
        record(area, "returns of the expired stock", "GET", "/api/v1/product-returns", 200, lr)
        rows = as_list(lr)
        ret = rows[0] if rows else None
        if not ret:
            info(area, "automatic R1 return", "no return found after the expiry job", "FAIL")
            cats = as_list(self.api.call("GET", "/api/v1/return-categories"))
            cid = next((c["returnCategoryId"] for c in cats if c.get("categoryCode") == "R1"), cats[0]["returnCategoryId"] if cats else None)
            r = self.ok(area, "create return by hand", "POST", "/api/v1/product-returns", 201,
                        self.full("ProductReturnDTO", {"warehouseStockId": stock["warehouseStockId"], "returnCategoryId": cid,
                                                       "quantity": 10, "reason": "Batch expired before it could be sold", "targetWarehouseId": wh["warehouseId"]}))
            ret = body_of(r) if r.status_code == 201 else None
        if not ret:
            return
        base = f"/api/v1/product-returns/{ret['productReturnId']}"
        self.ok(area, "receive before approve -> 422", "POST", base + "/receive", 422)
        self.ok(area, "get return", "GET", base, 200)
        self.ok(area, "approve", "POST", base + "/approve", 200, {"targetWarehouseId": wh["warehouseId"], "remarks": "Return to the central warehouse for disposal"})
        self.ok(area, "edit after approve -> 422", "PUT", base, (409, 422), {"version": 0, "reason": "changed"})
        self.ok(area, "ship", "POST", base + "/ship", 200)
        self.ok(area, "receive", "POST", base + "/receive", 200)
        self.ok(area, "delete received return -> 422", "DELETE", base, 422)
        # second return on the same stock (now 0): quantity check, then a normal return that is rejected
        good = self.make("WarehouseStockDTO", {"warehouseId": wh["warehouseId"], "productBatchId": batch["productBatchId"],
                                               "ownerDistributorId": dist["distributorId"], "reorderLevel": 0}, area)
        if good:
            self.movement(area, good["warehouseStockId"], "IN", 4)
            cats = as_list(self.api.call("GET", "/api/v1/return-categories"))
            cid = next((c["returnCategoryId"] for c in cats if c.get("categoryCode") == "R3"), cats[0]["returnCategoryId"] if cats else None)
            self.ok(area, "return more than stock -> 422", "POST", "/api/v1/product-returns", 422,
                    self.full("ProductReturnDTO", {"warehouseStockId": good["warehouseStockId"], "returnCategoryId": cid, "quantity": 99}))
            r = self.ok(area, "create return (R3 damaged)", "POST", "/api/v1/product-returns", 201,
                        self.full("ProductReturnDTO", {"warehouseStockId": good["warehouseStockId"], "returnCategoryId": cid,
                                                       "quantity": 2, "reason": "Packs crushed in the godown"}))
            r2 = body_of(r) if r.status_code == 201 else None
            if r2:
                b2 = f"/api/v1/product-returns/{r2['productReturnId']}"
                cur = body_of(self.api.call("GET", b2)) or {}
                self.ok(area, "edit requested return", "PUT", b2, 200, {"version": cur.get("version", 0), "reason": "Packs crushed in the godown during unloading"})
                self.ok(area, "reject", "POST", b2 + "/reject", 200, {"reason": "No damage found on inspection"})
                self.ok(area, "delete rejected return", "DELETE", b2, 204)

    # ------------------------------------------------------------------ exchange + orders
    def exchange_and_orders(self):
        area = "exchange"
        ctx = getattr(self, "stock_ctx", None)
        dist = self.b.ensure(self.p("DistributorDTO"))
        if ctx and dist:
            r = self.ok(area, "create exchange request", "POST", "/api/v1/exchange-requests", 201,
                        self.full("ExchangeRequestDTO", {"distributorId": dist["distributorId"], "productId": ctx["product"]["productId"],
                                                         "requestedQuantity": 2}))
            ex = body_of(r) if r.status_code == 201 else None
            self.ok(area, "quantity above limit -> 422", "POST", "/api/v1/exchange-requests", 422,
                    self.full("ExchangeRequestDTO", {"distributorId": dist["distributorId"], "productId": ctx["product"]["productId"],
                                                     "requestedQuantity": 99999999}))
            if ex:
                base = f"/api/v1/exchange-requests/{ex['exchangeId']}"
                self.ok(area, "complete before approve -> 422", "POST", base + "/complete", 422, {})
                self.ok(area, "approve", "POST", base + "/approve", 200, {"sourceWarehouseStockId": ctx["stock"]["warehouseStockId"],
                                                                        "destinationWarehouseId": ctx["warehouse"]["warehouseId"]})
                self.ok(area, "get request", "GET", base, 200)
                self.ok(area, "edit after approve -> 422", "PUT", base, (409, 422), {"version": 0, "reason": "Change after approval"})
                self.ok(area, "complete (stock transfer)", "POST", base + "/complete", 200, {})
                self.ok(area, "history", "GET", base + "/history", 200)
            r = self.api.call("POST", "/api/v1/exchange-requests", self.full("ExchangeRequestDTO", {
                "distributorId": dist["distributorId"], "productId": ctx["product"]["productId"], "requestedQuantity": 1}))
            ex2 = body_of(r) if r.status_code == 201 else None
            if ex2:
                b2 = f"/api/v1/exchange-requests/{ex2['exchangeId']}"
                cur = body_of(self.api.call("GET", b2)) or {}
                self.ok(area, "edit requested exchange", "PUT", b2, 200, {"version": cur.get("version", 0), "requestedQuantity": 3})
                self.ok(area, "reject", "POST", b2 + "/reject", 200, {"reason": "No spare stock in the region this week"})
        else:
            info(area, "exchange", "skipped: dispatch flow did not create stock", "WARN")
        area = "orders"
        st_path = self.p("OrderStatusDTO")
        if not st_path:
            return
        s1, _, _ = self.b.create(st_path, {"statusName": f"Placed #{random.randint(100, 999)}", "sequenceNumber": 1, "isTerminal": False})
        s2, _, _ = self.b.create(st_path, {"statusName": f"Approved #{random.randint(100, 999)}", "sequenceNumber": 2, "isTerminal": False})
        if not (s1 and s2):
            info(area, "order statuses", "could not create", "WARN")
            return
        o = self.make("DistributorOrderDTO", {"orderNumber": f"ORD-{RUN}{rnd(4)}", "orderStatusId": s1["orderStatusId"]}, area)
        if not o:
            return
        base = f"/api/v1/distributor-orders/{o['orderId']}"
        self.ok(area, "move forward", "POST", base + "/status", 200, {"status": s2["statusName"]})
        self.ok(area, "move backward -> 422", "POST", base + "/status", 422, {"status": s1["statusName"]})
        self.ok(area, "cancel", "POST", base + "/cancel", 200, {"reason": "Duplicate order placed by mistake"})
        self.ok(area, "change after cancel -> 422", "POST", base + "/status", 422, {"status": s2["statusName"]})
        self.ok(area, "history", "GET", base + "/history", 200)

    # ------------------------------------------------------------------ commitments, health, recovery
    def distributor_flows(self):
        area = "commitments"
        dist = self.b.ensure(self.p("DistributorDTO"))
        c = self.make("CommitmentDTO", {"distributorId": dist and dist["distributorId"], "targetValue": 100,
                                        "dueDate": str(TODAY + dt.timedelta(days=30))}, area)
        if c:
            base = f"/api/v1/commitments/{c['commitmentId']}"
            self.ok(area, "approve", "POST", base + "/approve", 200, {"remarks": "Target agreed in the monthly review"})
            self.ok(area, "approve twice -> 422", "POST", base + "/approve", 422, {})
            self.make("CommitmentProgressDTO", {"commitmentId": c["commitmentId"], "progressValue": 100}, area)
            r = self.ok(area, "completion %", "GET", base + "/completion", 200)
            info(area, "completion after 100% progress", short(r.text))
            self.ok(area, "history", "GET", base + "/history", 200)
        c2 = self.make("CommitmentDTO", {"distributorId": dist and dist["distributorId"], "targetValue": 50,
                                         "dueDate": str(TODAY + dt.timedelta(days=20))}, area)
        if c2:
            self.ok(area, "reject", "POST", f"/api/v1/commitments/{c2['commitmentId']}/reject", 200, {"reason": "Target is lower than last quarter"})
        if self.p("CommitmentDTO"):
            self.ok(area, "due date in the past -> 422", "POST", self.p("CommitmentDTO"), 422,
                    self.full("CommitmentDTO", {"dueDate": str(TODAY - dt.timedelta(days=5))}))
        area = "health"
        self.ok(area, "weights check", "GET", "/api/v1/health-scores/weights/check", 200)
        if dist:
            path = f"/api/v1/health-scores/calculate/{dist['distributorId']}"
            r = self.api.call("POST", path)
            note = "422 is correct when the active weights do not total 100%" if r.status_code == 422 else ""
            record(area, "calculate health score", "POST", path, (200, 422), r, note)
            self.ok(area, "trend", "GET", f"/api/v1/health-scores/{dist['distributorId']}/trend", 200)
            self.ok(area, "continuity check", "GET", f"/api/v1/continuity/{dist['distributorId']}", 200)
            self.ok(area, "performance", "GET", f"/api/v1/performance/{dist['distributorId']}", (200, 404))
            self.ok(area, "credit risk", "GET", f"/api/v1/credit-risk/{dist['distributorId']}", 200)
            self.ok(area, "credit risk save", "POST", f"/api/v1/credit-risk/calculate/{dist['distributorId']}", 200)
        self.ok(area, "continuity at risk", "GET", "/api/v1/continuity/at-risk", 200)
        area = "recovery"
        plan = self.make("RecoveryPlanDTO", {"distributorId": dist and dist["distributorId"], "targetAmount": 50000,
                                             "startDate": str(TODAY), "endDate": str(TODAY + dt.timedelta(days=90))}, area)
        if plan:
            m = self.make("RecoveryMilestoneDTO", {"recoveryPlanId": plan["recoveryPlanId"], "title": "Collect first instalment of dues", "targetAmount": 12500,
                                                   "dueDate": str(TODAY + dt.timedelta(days=30))}, area)
            if m:
                self.ok(area, "complete milestone", "POST", f"/api/v1/recovery-milestones/{m['milestoneId']}/complete", 200,
                        {"achievedAmount": 12500})
                self.ok(area, "complete twice -> 422", "POST", f"/api/v1/recovery-milestones/{m['milestoneId']}/complete", 422,
                        {"achievedAmount": 1})
            self.ok(area, "progress", "GET", f"/api/v1/recovery-plans/{plan['recoveryPlanId']}/progress", 200)
            self.ok(area, "close", "POST", f"/api/v1/recovery-plans/{plan['recoveryPlanId']}/close", 200,
                    {"outcome": "PARTIALLY_RECOVERED", "remarks": "60% of dues collected, balance moved to a payment plan"})
            self.ok(area, "close twice -> 422", "POST", f"/api/v1/recovery-plans/{plan['recoveryPlanId']}/close", 422,
                    {"outcome": "RECOVERED"})


    # ================================================================== extra checks

    def login_as(self, role_schema, link):
        """Creates an Active user, links it to a role table (e.g. SalesManagerDTO) and returns its (email, password)."""
        users = self.p("AppUserDTO")
        uname = person()
        email, pw = email_for(uname), "Role@12345"
        r = self.api.call("POST", users, {"email": email, "userName": uname, "passwordHash": pw,
                                          "phone": phone(), "status": "Active"})
        if r.status_code != 201:
            record("roles", f"create user for {role_schema}", "POST", users, 201, r)
            return None
        uid = body_of(r)["userId"]
        path = self.p(role_schema)
        if not path:
            info("roles", role_schema, "no API for this role table", "WARN")
            return None
        row, r2, body = self.b.create(path, dict(link or {}, userId=uid))
        if row is None:
            record("roles", f"link user to {role_schema}", "POST", path, 201, r2, note="body=" + short(json.dumps(body), 200))
            return None
        return (email, pw)

    def allowed(self, area, test, method, path, auth, body=None):
        """Allowed = the permission check lets it through (anything except 401/403)."""
        r = self.api.call(method, path, body, auth=auth)
        ok = r.status_code not in (401, 403, 0)
        results.append({"area": area, "test": test + " (allowed)", "method": method, "path": path, "expected": "not 401/403",
                        "actual": r.status_code, "result": "PASS" if ok else "FAIL", "detail": "" if ok else short(r.text, 200)})

    def refused(self, area, test, method, path, auth, body=None):
        self.ok(area, test + " (refused)", method, path, 403, body or {}, auth=auth)

    def roles(self):
        area = "roles"
        region = self.b.ensure(self.p("RegionDTO"))
        dept = self.b.ensure(self.p("DepartmentDTO"))
        manu = self.b.ensure(self.p("ManufacturerDTO"))
        full = lambda schema: self.full(schema, {}) if self.p(schema) else {}
        sm = self.login_as("SalesManagerDTO", {"regionId": region and region.get("regionId")})
        fm = self.login_as("FinanceManagerDTO", {"departmentId": dept and dept.get("departmentId")})
        rm = self.login_as("RecoveryManagerDTO", {"regionId": region and region.get("regionId")})
        mf = self.login_as("ManufacturerUserDTO", {"manufacturerId": manu and manu.get("manufacturerId")})
        if sm:
            self.ok(area, "sales manager: who am I", "GET", "/api/v1/auth/me", 200, auth=sm)
            self.allowed(area, "sales manager: create distributor", "POST", "/api/v1/distributors", sm, full("DistributorDTO"))
            self.refused(area, "sales manager: create product", "POST", "/api/v1/products", sm, full("ProductDTO"))
            self.refused(area, "sales manager: create invoice", "POST", "/api/v1/invoices", sm, full("InvoiceDTO"))
            self.refused(area, "sales manager: audit log", "GET", "/api/v1/audit-logs", sm)
            self.allowed(area, "sales manager: read invoices", "GET", "/api/v1/invoices", sm)
            self.allowed(area, "sales manager: continuity at risk", "GET", "/api/v1/continuity/at-risk", sm)
            self.allowed(area, "sales manager: export distributors", "GET", "/api/v1/exports/Distributor?format=csv", sm)
            self.refused(area, "sales manager: export users", "GET", "/api/v1/exports/AppUser?format=csv", sm)
        if fm:
            self.allowed(area, "finance manager: create invoice", "POST", "/api/v1/invoices", fm, full("InvoiceDTO"))
            self.refused(area, "finance manager: create distributor", "POST", "/api/v1/distributors", fm, full("DistributorDTO"))
            self.allowed(area, "finance manager: credit risk", "GET", "/api/v1/credit-risk/1", fm)
            self.refused(area, "finance manager: run a job", "POST", "/api/v1/jobs/expiry-check/run", fm)
        if rm:
            self.allowed(area, "recovery manager: create SLA policy", "POST", "/api/v1/sla-policies", rm, full("SlaPolicyDTO"))
            self.allowed(area, "recovery manager: create recovery plan", "POST", "/api/v1/recovery-plans", rm, full("RecoveryPlanDTO"))
            self.refused(area, "recovery manager: create product", "POST", "/api/v1/products", rm, full("ProductDTO"))
            self.refused(area, "recovery manager: create invoice", "POST", "/api/v1/invoices", rm, full("InvoiceDTO"))
        if mf:
            self.allowed(area, "manufacturer: create product", "POST", "/api/v1/products", mf,
                         dict(full("ProductDTO"), productCode=ean13()))
            self.allowed(area, "manufacturer: inventory analytics", "GET", "/api/v1/inventory-analytics/aging", mf)
            self.refused(area, "manufacturer: create distributor", "POST", "/api/v1/distributors", mf, full("DistributorDTO"))
            self.refused(area, "manufacturer: system settings change", "POST", "/api/v1/system-configs", mf,
                         {"configKey": realistic("configKey", 100), "configValue": "30"})
            self.refused(area, "manufacturer: confirm a delivery", "POST", "/api/v1/delivery-receipts/1/confirm", mf,
                         {"handoverCode": "123456"})
        # a user who is not Active cannot log in
        users = self.p("AppUserDTO")
        susp_name = person()
        email = email_for(susp_name)
        r = self.api.call("POST", users, {"email": email, "userName": susp_name, "passwordHash": "Susp@12345",
                                          "phone": phone(), "status": "Suspended"})
        if record(area, "create a Suspended user", "POST", users, 201, r):
            self.ok(area, "Suspended user cannot log in -> 401", "GET", "/api/v1/auth/me", 401, auth=(email, "Susp@12345"))
        # passwords are never returned
        lr = self.api.call("GET", users, params={"page": 0, "size": 5})
        leak = any("passwordHash" in x for x in as_list(lr))
        info(area, "passwordHash never returned by the users API", "leaked!" if leak else "not present in the response",
             "FAIL" if leak else "PASS")

    def ownership(self):
        area = "ownership"
        dpath = self.p("DistributorDTO")
        if not (dpath and self.p("DistributorUserDTO") and self.p("TicketDTO")):
            return
        a, _, _ = self.b.create(dpath)
        b, _, _ = self.b.create(dpath)
        if not (a and b):
            info(area, "two distributors", "could not create", "WARN")
            return
        ua = self.login_as("DistributorUserDTO", {"distributorId": a["distributorId"]})
        if not ua:
            return
        tb, r, _ = self.b.create(self.p("TicketDTO"), {"distributorId": b["distributorId"], "subject": "Invoice amount mismatch"})
        if not tb:
            record(area, "ticket for distributor B", "POST", "/api/v1/tickets", 201, r)
            return
        self.ok(area, "A cannot read B's ticket -> 404", "GET", f"/api/v1/tickets/{tb['ticketId']}", 404, auth=ua)
        rows = as_list(self.api.call("GET", "/api/v1/tickets", auth=ua))
        bad = [x for x in rows if x.get("distributorId") != a["distributorId"]]
        info(area, "A's ticket list only has A's tickets", f"{len(bad)} row(s) of other distributors" if bad else f"{len(rows)} row(s), all own",
             "FAIL" if bad else "PASS")
        self.ok(area, "A cannot create a ticket for B -> 403", "POST", "/api/v1/tickets", 403,
                self.full("TicketDTO", {"distributorId": b["distributorId"], "subject": "Shipment delayed by 3 days"}), auth=ua)
        r = self.api.call("POST", "/api/v1/tickets", self.full("TicketDTO", {"distributorId": None, "subject": "Damaged packaging on arrival"}), auth=ua)
        record(area, "A creates own ticket (distributor filled in automatically)", "POST", "/api/v1/tickets", 201, r)
        if r.status_code == 201 and (body_of(r) or {}).get("distributorId") != a["distributorId"]:
            info(area, "owner filled in", "distributorId is not A's", "FAIL")
        self.ok(area, "A cannot change B's ticket -> 404", "PUT", f"/api/v1/tickets/{tb['ticketId']}", (403, 404),
                {"version": tb.get("version", 0), "description": "Changed by another distributor"}, auth=ua)
        self.ok(area, "A cannot see B's health trend -> 404", "GET", f"/api/v1/health-scores/{b['distributorId']}/trend", 404, auth=ua)
        self.ok(area, "A cannot see B's credit risk (role) -> 403", "GET", f"/api/v1/credit-risk/{b['distributorId']}", 403, auth=ua)
        if getattr(self, "dist_user", None):
            du = (self.dist_user["email"], self.dist_user["password"])
            n = as_list(self.api.call("GET", "/api/v1/notifications/mine", auth=du))
            info(area, "distributor received notifications (dispatch, orders ...)", f"{len(n)} notification(s)",
                 "PASS" if n else "WARN")

    def alerts(self):
        area = "alerts"
        wh = self.b.ensure(self.p("WarehouseDTO"))
        prod = self.make("ProductDTO", {"productCode": ean13(), "unitCost": 10}, area)
        if not (wh and prod):
            return
        batch = self.make("ProductBatchDTO", {"productId": prod["productId"], "batchNumber": realistic("batchNumber", 100),
                                              "expiryDate": str(TODAY + dt.timedelta(days=10))}, area)
        if not batch:
            return
        st = self.make("WarehouseStockDTO", {"warehouseId": wh["warehouseId"], "productBatchId": batch["productBatchId"],
                                             "ownerDistributorId": None, "reorderLevel": 50}, area)
        if not st:
            return
        sid = st["warehouseStockId"]
        self.movement(area, sid, "IN", 60)
        self.movement(area, sid, "OUT", 20)
        al = as_list(self.api.call("GET", self.p("InventoryAlertDTO") or "/api/v1/inventory-alerts", params={"warehouseStockId": sid}))
        info(area, "LOW_STOCK alert after stock fell to 40 (reorder level 50)",
             str([x.get("alertType") for x in al]), "PASS" if any(x.get("alertType") == "LOW_STOCK" for x in al) else "FAIL")
        self.api.call("POST", "/api/v1/jobs/expiry-check/run")
        al = as_list(self.api.call("GET", self.p("InventoryAlertDTO") or "/api/v1/inventory-alerts", params={"warehouseStockId": sid}))
        info(area, "NEAR_EXPIRY alert for a batch expiring in 10 days",
             str([x.get("alertType") for x in al]), "PASS" if any(x.get("alertType") == "NEAR_EXPIRY" for x in al) else "FAIL")
        self.api.call("POST", "/api/v1/jobs/expiry-check/run")
        al2 = as_list(self.api.call("GET", self.p("InventoryAlertDTO") or "/api/v1/inventory-alerts", params={"warehouseStockId": sid}))
        info(area, "running the job again does not duplicate alerts", f"{len(al)} -> {len(al2)}", "PASS" if len(al2) == len(al) else "FAIL")
        cur = as_list(self.api.call("GET", "/api/v1/stocks/current", params={"expiryState": "NEAR_EXPIRY"}))
        info(area, "current stock filter expiryState=NEAR_EXPIRY", f"{len(cur)} row(s)",
             "PASS" if any(x.get("warehouseStockId") == sid for x in cur) else "FAIL")
        self.ok(area, "audit trail of the stock row", "GET", "/api/v1/audit-logs", 200, params={"entityName": "InventoryMovement"})

    def recovery_mode(self):
        area = "recovery mode"
        rp = self.p("ReportingPeriodDTO")
        if not (rp and self.p("SalesTargetDTO")):
            return
        # use the period the server treats as "current" (covers today, shortest, first created); create one if none
        current = None
        for x in sorted(as_list(self.api.call("GET", rp)), key=lambda x: x.get("reportingPeriodId") or 0):
            try:
                sd, ed = dt.date.fromisoformat(str(x.get("startDate"))), dt.date.fromisoformat(str(x.get("endDate")))
            except ValueError:
                continue
            if sd <= TODAY <= ed and (current is None or (ed - sd) < current[0]):
                current = ((ed - sd), x)
        period = current[1] if current else None
        if not period:
            period, r, _ = self.b.create(rp, {"periodName": TODAY.strftime("%d %B %Y"), "startDate": str(TODAY - dt.timedelta(days=1)),
                                              "endDate": str(TODAY + dt.timedelta(days=1))})
            if not period:
                record(area, "reporting period covering today", "POST", rp, 201, r)
                return
        d, _, _ = self.b.create(self.p("DistributorDTO"))
        if not d:
            return
        t, r, _ = self.b.create(self.p("SalesTargetDTO"), {"distributorId": d["distributorId"],
                                                           "reportingPeriodId": period["reportingPeriodId"], "targetValue": 10000})
        if not t:
            record(area, "sales target", "POST", self.p("SalesTargetDTO"), 201, r)
            return
        pr = self.ok(area, "performance with no sales", "GET", f"/api/v1/performance/{d['distributorId']}", 200,
                     params={"reportingPeriodId": period["reportingPeriodId"]})
        st = (body_of(pr) or {}).get("status")
        info(area, "status below the threshold", f"status={st}", "PASS" if st == "RECOVERY" else "FAIL")
        j = self.ok(area, "run recovery-mode job", "POST", "/api/v1/jobs/recovery-mode/run", 200)
        info(area, "recovery-mode result", short(j.text, 300))
        plans = as_list(self.api.call("GET", "/api/v1/recovery-plans", params={"distributorId": d["distributorId"]}))
        info(area, "recovery plan opened in Recovery Mode", f"{len(plans)} plan(s): " + str([p.get("recoveryMode") for p in plans]),
             "PASS" if any(p.get("recoveryMode") for p in plans) else "FAIL")
        self.api.call("POST", "/api/v1/jobs/recovery-mode/run")
        plans2 = as_list(self.api.call("GET", "/api/v1/recovery-plans", params={"distributorId": d["distributorId"]}))
        info(area, "running it again does not open a second plan", f"{len(plans)} -> {len(plans2)}",
             "PASS" if len(plans2) == len(plans) else "FAIL")

    def calculations(self):
        area = "calculations"
        # credit risk: invoice 5000, paid 1000, limit 10000 -> outstanding 4000, utilisation 40%, score 28, LOW
        d, _, _ = self.b.create(self.p("DistributorDTO"))
        if d and self.p("InvoiceDTO") and self.p("PaymentDTO") and self.p("DistributorCreditLimitDTO"):
            o = self.make("DistributorOrderDTO", {"distributorId": d["distributorId"], "orderNumber": f"ORD-{RUN}{rnd(4)}"}, area)
            inv = o and self.make("InvoiceDTO", {"orderId": o["orderId"], "invoiceAmount": 5000,
                                                 "invoiceNumber": realistic("invoiceNumber", 50), "dueDate": str(TODAY + dt.timedelta(days=30))}, area)
            pay = inv and self.make("PaymentDTO", {"invoiceId": inv["invoiceId"], "amount": 1000}, area)
            self.ok(area, "payment above the outstanding balance -> 422", "POST", self.p("PaymentDTO"), 422,
                    self.full("PaymentDTO", {"invoiceId": inv["invoiceId"], "amount": 999999})) if inv else None
            lim = self.make("DistributorCreditLimitDTO", {"distributorId": d["distributorId"], "creditLimit": 10000,
                                                          "validFrom": str(TODAY - dt.timedelta(days=1)),
                                                          "validTo": str(TODAY + dt.timedelta(days=60))}, area)
            if inv and pay and lim:
                r = self.ok(area, "credit risk", "GET", f"/api/v1/credit-risk/{d['distributorId']}", 200)
                c = body_of(r) or {}
                good = (float(c.get("outstanding") or -1) == 4000 and float(c.get("utilisationPercent") or -1) == 40
                        and float(c.get("riskScore") or -1) == 28 and c.get("riskLevel") == "LOW")
                info(area, "credit risk numbers (outstanding 4000, 40%, score 28, LOW)",
                     f"outstanding={c.get('outstanding')} utilisation={c.get('utilisationPercent')} score={c.get('riskScore')} level={c.get('riskLevel')}",
                     "PASS" if good else "FAIL")
        # emission: distance x factor
        f = self.make("EmissionFactorDTO", {"factorValue": 0.25, "validFrom": str(TODAY - dt.timedelta(days=1))}, area)
        if f and self.p("TransportationActivityDTO"):
            ta = self.make("TransportationActivityDTO", {"emissionFactorId": f["emissionFactorId"], "distanceKm": 120}, area)
            if ta:
                got = (body_of(self.api.call("GET", f"{self.p('TransportationActivityDTO')}/{ta['transportationActivityId']}")) or {}).get("emissionKg")
                info(area, "emission = 120 km x 0.25 = 30 kg", f"emissionKg={got}", "PASS" if got is not None and abs(float(got) - 30) < 0.01 else "FAIL")
        # health score with weights that total exactly 100 %
        wc = body_of(self.api.call("GET", "/api/v1/health-scores/weights/check")) or {}
        total = float(wc.get("totalPercent") or 0)
        hd, _, _ = self.b.create(self.p("DistributorDTO"))
        if hd and self.p("HealthParameterWeightDTO") and self.p("DistributorHealthAssessmentDTO"):
            if total < 100:
                param = self.make("HealthParameterDTO", {"parameterName": random.choice(WORDS_BY_FIELD["parametername"]) + " " + str(random.randint(2, 99)), "isActive": True}, area)
                w = param and self.make("HealthParameterWeightDTO", {"parameterId": param["parameterId"],
                                                                     "weight": round((100 - total) / 100, 4),
                                                                     "validFrom": str(TODAY - dt.timedelta(days=1)),
                                                                     "validTo": str(TODAY + dt.timedelta(days=30))}, area)
                if w:
                    self.make("DistributorHealthAssessmentDTO", {"distributorId": hd["distributorId"],
                                                                 "parameterWeightId": w["parameterWeightId"], "score": 80}, area)
            self.ok(area, "a weight that pushes the total over 100% -> 422", "POST", self.p("HealthParameterWeightDTO"), 422,
                    self.full("HealthParameterWeightDTO", {"weight": 0.9, "validFrom": str(TODAY), "validTo": None}))
            wc2 = body_of(self.api.call("GET", "/api/v1/health-scores/weights/check")) or {}
            info(area, "weights now total 100%", f"total={wc2.get('totalPercent')} valid={wc2.get('valid')}",
                 "PASS" if wc2.get("valid") else "WARN")
            r = self.ok(area, "health score calculation", "POST", f"/api/v1/health-scores/calculate/{hd['distributorId']}",
                        200 if wc2.get("valid") else (200, 422))
            h = body_of(r) or {}
            if r.status_code == 200:
                info(area, "health score result", f"total={h.get('totalScore')} band={h.get('riskCategory')} "
                     f"missing={len(h.get('missingParameters') or [])} alert={h.get('alertRaised')}", "PASS" if h.get("totalScore") is not None else "FAIL")
                tr = as_list(self.api.call("GET", f"/api/v1/health-scores/{hd['distributorId']}/trend"))
                info(area, "score stored in the trend", f"{len(tr)} row(s)", "PASS" if tr else "FAIL")
        # audit trail of a created row
        if d:
            al = as_list(self.api.call("GET", "/api/v1/audit-logs", params={"entityName": "Distributor", "entityId": d["distributorId"]}))
            info(area, "audit log has the CREATE of the new distributor", str([x.get("action") for x in al]),
                 "PASS" if any(x.get("action") == "CREATE" for x in al) else "FAIL")

    def limits(self):
        area = "limits"
        self.ok(area, "size above 100 -> 400", "GET", "/api/v1/distributors", 400, params={"page": 0, "size": 101})
        self.ok(area, "negative page -> 400", "GET", "/api/v1/distributors", 400, params={"page": -1, "size": 5})
        self.ok(area, "sort by unknown field -> 400", "GET", "/api/v1/distributors", 400, params={"sort": "noSuchField,desc"})
        r = self.ok(area, "sort by distributorId,desc", "GET", "/api/v1/distributors", 200, params={"page": 0, "size": 5, "sort": "distributorId,desc"})
        ids = [x.get("distributorId") for x in as_list(r)]
        info(area, "sorted newest first", str(ids), "PASS" if ids == sorted(ids, reverse=True) else "FAIL")
        self.ok(area, "filter with a wrong value type -> 400", "GET", "/api/v1/distributors", 400, params={"regionId": "two"})
        self.ok(area, "malformed JSON -> 400", "POST", "/api/v1/regions", 400, None)
        tk = self.b.ensure(self.p("TicketDTO"))
        if tk:
            big = {"file": ("site_photos_bundle.pdf", io.BytesIO(b"0" * (5 * 1024 * 1024 + 500_000)), "application/pdf")}
            rr = self.api.call("POST", f"/api/v1/tickets/{tk['ticketId']}/attachments", files=big)
            record(area, "evidence file over 5 MB -> 400", "POST", "/api/v1/tickets/{id}/attachments", (400, 413), rr)
        rid = self.api.call("GET", "/api/v1/distributors/987654321", headers={"X-Request-Id": "tester-123"})
        info(area, "request id returned in X-Request-Id", rid.headers.get("X-Request-Id"),
             "PASS" if rid.headers.get("X-Request-Id") == "tester-123" else "FAIL")
        e = body_of(rid) or {}
        info(area, "error body has status, code, message, path", short(e), "PASS" if all(k in e for k in ("status", "message", "path")) else "FAIL")

    def concurrency(self):
        area = "concurrency"
        import threading
        path = self.p("RegionDTO")
        row, _, _ = self.b.create(path) if path else (None, None, None)
        if not row:
            return
        url = f"{path}/{row['regionId']}"
        v = (body_of(self.api.call("GET", url)) or {}).get("version", 0)
        codes = []

        def upd(n):
            a = Api(self.api.base, *self.api.auth)
            codes.append(a.call("PUT", url, {"version": v, "regionName": realistic("regionName", 100)}).status_code)
        th = [threading.Thread(target=upd, args=(i,)) for i in range(2)]
        [t.start() for t in th]
        [t.join() for t in th]
        info(area, "two users update the same row at the same time: one wins, one gets 409", f"status codes {sorted(codes)}",
             "PASS" if sorted(codes) == [200, 409] else ("WARN" if codes == [200, 200] else "FAIL"))

    def database_checks(self, db_url):
        area = "database"
        if not db_url:
            info(area, "SLA escalation, plain-text password upgrade",
                 "skipped: run with --db postgresql://postgres:1234@localhost:5432/Distributor_Network_Performance_db", "INFO")
            info(area, "nightly schedule", "not tested: it runs at 02:15 when dnp.jobs.enabled=true (every job is tested with run-now)", "INFO")
            return
        try:
            import psycopg2
        except ImportError:
            info(area, "database checks", "install psycopg2-binary:  pip install psycopg2-binary", "WARN")
            return
        con = psycopg2.connect(db_url)
        con.autocommit = True
        cur = con.cursor()
        # 1. SLA escalation: make a ticket overdue
        t = self.make("TicketDTO", {"subject": "Shipment delayed by 3 days"}, area)
        if t:
            cur.execute("update dsphere.ticket set sla_due_at = now() - interval '2 hours' where ticket_id = %s", (t["ticketId"],))
            self.ok(area, "run ticket-sla-escalation", "POST", "/api/v1/jobs/ticket-sla-escalation/run", 200)
            lvl = (body_of(self.api.call("GET", f"/api/v1/tickets/{t['ticketId']}")) or {}).get("escalationLevel")
            info(area, "overdue ticket escalated to level 1", f"escalationLevel={lvl}", "PASS" if lvl == 1 else "FAIL")
            self.api.call("POST", "/api/v1/jobs/ticket-sla-escalation/run")
            lvl2 = (body_of(self.api.call("GET", f"/api/v1/tickets/{t['ticketId']}")) or {}).get("escalationLevel")
            info(area, "not escalated again within 24 h", f"escalationLevel={lvl2}", "PASS" if lvl2 == 1 else "FAIL")
        # 2. old plain-text password is upgraded to BCrypt at login
        email = email_for()
        cur.execute("insert into dsphere.app_user (email, user_name, password_hash, phone, status, created_at, updated_at, version) "
                    "values (%s, 'Meena Raman', 'Plain@123', '9876543210', 'Active', now(), now(), 0) returning user_id", (email,))
        self.ok(area, "login with an old plain-text password", "GET", "/api/v1/auth/me", 200, auth=(email, "Plain@123"))
        cur.execute("select password_hash from dsphere.app_user where email = %s", (email,))
        h = cur.fetchone()[0]
        info(area, "password stored as BCrypt after login", h[:7] + "...", "PASS" if h.startswith("$2") else "FAIL")
        # 3. stock quantity can never be negative in the database either
        try:
            cur.execute("update dsphere.warehouse_stock set quantity = -1 where warehouse_stock_id = (select min(warehouse_stock_id) from dsphere.warehouse_stock)")
            info(area, "database refuses a negative stock quantity", "the update was accepted", "FAIL")
        except Exception as e:
            info(area, "database refuses a negative stock quantity", short(e, 150), "PASS")
        con.close()

    # ------------------------------------------------------------------ reports, jobs, exports, audit
    def reports(self):
        area = "reports"
        for rep in ("aging", "holding-cost", "turnover", "slow-moving", "working-capital", "stock-type"):
            self.ok(area, f"analytics {rep}", "GET", f"/api/v1/inventory-analytics/{rep}", 200)
        r = self.api.call("GET", "/api/v1/inventory-analytics/aging", params={"format": "xlsx"})
        record(area, "analytics aging as Excel", "GET", "/api/v1/inventory-analytics/aging?format=xlsx", 200, r)
        if r.status_code == 200 and not r.content.startswith(b"PK"):
            info(area, "Excel file", "response is not an xlsx file", "FAIL")
        self.ok(area, "dashboard", "GET", "/api/v1/dashboard/summary", 200)
        self.ok(area, "dashboard as PDF", "GET", "/api/v1/dashboard/summary", 200, params={"format": "pdf"})
        self.ok(area, "performance all", "GET", "/api/v1/performance", (200, 404))
        self.ok(area, "emission summary", "GET", "/api/v1/emissions/summary", 200)
        ta = self.make("TransportationActivityDTO", {"distanceKm": 120}, area)
        if ta:
            r = self.ok(area, "emission is calculated on save", "GET", f"{self.p('TransportationActivityDTO')}/{ta['transportationActivityId']}", 200)
            if r.status_code == 200 and (body_of(r) or {}).get("emissionKg") is None:
                info(area, "emissionKg", "not calculated (emission factor value missing?)", "WARN")
            self.ok(area, "recalculate emission", "POST", f"/api/v1/emissions/calculate/{ta['transportationActivityId']}", 200)
        self.ok(area, "recalculate unknown activity -> 404", "POST", "/api/v1/emissions/calculate/987654321", 404)
        b = self.api.call("POST", "/api/v1/batch/distributors/import")
        record(area, "distributor CSV import (Spring Batch)", "POST", "/api/v1/batch/distributors/import", (200, 202), b,
               "imports input/distributors.csv")
        self.ok(area, "exportable tables", "GET", "/api/v1/exports", 200)
        for fmt, magic in (("xlsx", b"PK"), ("pdf", b"%PDF"), ("csv", b"")):
            r = self.api.call("GET", "/api/v1/exports/Distributor", params={"format": fmt})
            record(area, f"export Distributor {fmt}", "GET", f"/api/v1/exports/Distributor?format={fmt}", 200, r)
            if r.status_code == 200 and magic and not r.content.startswith(magic):
                info(area, f"export {fmt}", "file content looks wrong", "FAIL")
        self.ok(area, "export unknown table -> 404", "GET", "/api/v1/exports/NoSuchTable", 404)
        self.ok(area, "export bad format -> 400", "GET", "/api/v1/exports/Distributor", 400, params={"format": "doc"})
        area = "jobs"
        jl = self.ok(area, "list jobs", "GET", "/api/v1/jobs", 200)
        for j in as_list(jl):
            name = j.get("name")
            if name and name != "expiry-check":
                # recovery-mode answers 404 when no reporting period exists yet
                r = self.ok(area, f"run {name}", "POST", f"/api/v1/jobs/{name}/run", (200, 404) if name == "recovery-mode" else 200)
                if r.status_code == 200:
                    info(area, f"{name} result", short(r.text, 300))
        self.ok(area, "unknown job -> 404", "POST", "/api/v1/jobs/no-such-job/run", 404)
        self.ok(area, "job runs", "GET", "/api/v1/job-runs", 200)
        area = "audit"
        r = self.ok(area, "audit log (latest)", "GET", "/api/v1/audit-logs", 200, params={"page": 0, "size": 20})
        if r.status_code == 200 and not body_of(r):
            info(area, "audit rows", "audit log is empty after all these changes", "FAIL")
        self.ok(area, "audit log cannot be changed -> 405", "DELETE", "/api/v1/audit-logs/1", (405, 404))
        mine = self.ok(area, "my notifications", "GET", "/api/v1/notifications/mine", 200)
        rows = body_of(mine) if mine.status_code == 200 else None
        rows = rows if isinstance(rows, list) else []
        if rows and isinstance(rows[0], dict) and rows[0].get("notificationId"):
            self.ok(area, "mark notification read", "POST", f"/api/v1/notifications/{rows[0]['notificationId']}/read", 200)
        else:
            info(area, "mark notification read", "skipped: the admin has no notifications yet", "INFO")
        self.ok(area, "mark someone else's / unknown notification -> 404", "POST", "/api/v1/notifications/987654321/read", 404)
        al = body_of(self.api.call("GET", "/api/v1/audit-logs", params={"page": 0, "size": 1}))
        if isinstance(al, list) and al and isinstance(al[0], dict) and al[0].get("auditId"):
            self.ok(area, "audit log by id", "GET", f"/api/v1/audit-logs/{al[0]['auditId']}", 200)
        jr = body_of(self.api.call("GET", "/api/v1/job-runs"))
        if isinstance(jr, list) and jr and isinstance(jr[0], dict) and jr[0].get("jobRunId"):
            self.ok(area, "job run by id", "GET", f"/api/v1/job-runs/{jr[0]['jobRunId']}", 200)
        self.ok(area, "logout", "POST", "/api/v1/auth/logout", (200, 204))


# ----------------------------------------------------------------------------------------------- report

def write_report():
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    cols = ["result", "area", "test", "method", "path", "expected", "actual", "detail"]
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
        wb = Workbook()
        ws = wb.active
        ws.title = "Results"
        ws.append([c.capitalize() for c in cols])
        for c in ws[1]:
            c.font = Font(bold=True)
        fills = {"PASS": "C6EFCE", "FAIL": "FFC7CE", "WARN": "FFEB9C", "INFO": "DDEBF7"}
        for r in results:
            ws.append([r.get(c, "") for c in cols])
            ws.cell(ws.max_row, 1).fill = PatternFill("solid", fgColor=fills.get(r["result"], "FFFFFF"))
        for col, w in zip("ABCDEFGH", (8, 12, 55, 8, 55, 10, 8, 90)):
            ws.column_dimensions[col].width = w
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        s = wb.create_sheet("Summary")
        s.append(["Area", "PASS", "FAIL", "WARN", "INFO"])
        for c in s[1]:
            c.font = Font(bold=True)
        areas = sorted({r["area"] for r in results})
        for a in areas + ["TOTAL"]:
            rows = results if a == "TOTAL" else [r for r in results if r["area"] == a]
            s.append([a] + [sum(1 for r in rows if r["result"] == k) for k in ("PASS", "FAIL", "WARN", "INFO")])
        s.column_dimensions["A"].width = 16
        name = f"dnp_api_test_report_{stamp}.xlsx"
        wb.save(name)
    except ImportError:
        name = f"dnp_api_test_report_{stamp}.csv"
        with open(name, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            w.writerows(results)
    return name


api_global = None


def main():
    global api_global
    ap = argparse.ArgumentParser(description="DNP automatic API tester")
    ap.add_argument("--url", default="http://localhost:8081")
    ap.add_argument("--user", default="admin@dnp.local")
    ap.add_argument("--password", default="Admin@12345")
    ap.add_argument("--only", choices=["generic", "flows"], help="run only one part")
    ap.add_argument("--db", help="optional PostgreSQL URL for the checks that need the database, e.g. "
                                 "postgresql://postgres:1234@localhost:5432/Distributor_Network_Performance_db (needs: pip install psycopg2-binary)")
    ap.add_argument("--cleanup", action="store_true", help="delete the test rows at the end (default: keep them)")
    a = ap.parse_args()

    api = Api(a.url, a.user, a.password)
    api_global = api
    t0 = time.time()
    print(f"Testing {a.url} as {a.user} ...")
    d = api.call("GET", "/v3/api-docs", auth=None)
    if d.status_code == 401:
        d = api.call("GET", "/v3/api-docs")
    if d.status_code != 200:
        print(f"Cannot read {a.url}/v3/api-docs (status {d.status_code}). Is the application running?  {short(d.text, 200)}")
        sys.exit(2)
    spec = Spec(d.json())
    me = api.call("GET", "/api/v1/auth/me")
    if me.status_code == 401:
        print("Login failed: check --user / --password (the bootstrap admin from dnp-secrets.properties).")
        sys.exit(3)
    me_id = (body_of(me) or {}).get("userId") if me.status_code == 200 else None
    if me_id is None:
        users = body_of(api.call("GET", "/api/v1/users", params={"page": 0, "size": 1})) or [{}]
        me_id = users[0].get("userId", 1) if users else 1
    print(f"{len(spec.resources)} table APIs found, logged-in user id {me_id}")
    builder = Builder(api, spec, me_id)
    flow = Flow(api, spec, builder, me_id)
    try:
        if a.only in (None, "flows"):
            for name, fn in (("security", lambda: flow.security(a.password)), ("dispatch", flow.stock_dispatch_delivery),
                             ("tickets", flow.tickets), ("returns", flow.returns), ("exchange/orders", flow.exchange_and_orders),
                             ("distributor", flow.distributor_flows), ("roles", flow.roles),
                             ("ownership", flow.ownership), ("alerts", flow.alerts), ("recovery mode", flow.recovery_mode),
                             ("calculations", flow.calculations), ("limits", flow.limits), ("concurrency", flow.concurrency),
                             ("database checks", lambda: flow.database_checks(a.db))):
                print(f"  flow: {name}")
                try:
                    fn()
                except Exception as e:
                    info(name, "flow crashed", f"{e}\n{traceback.format_exc()[-600:]}", "FAIL")
        if a.only in (None, "generic"):
            print("  generic tests for every table API (this takes a few minutes) ...")
            generic_tests(api, spec, builder)
            generic_readonly_lists(api, spec)
        if a.only in (None, "flows"):
            print("  flow: reports / jobs / exports / audit")
            try:
                flow.reports()
            except Exception as e:
                info("reports", "flow crashed", f"{e}\n{traceback.format_exc()[-600:]}", "FAIL")
    finally:
        if a.cleanup:
            print("  deleting the test rows ...")
            cleanup(api, builder)
        else:
            print("  test rows are kept in the database (add --cleanup to delete them)")
        name = write_report()
        p = sum(r["result"] == "PASS" for r in results)
        f = sum(r["result"] == "FAIL" for r in results)
        w = sum(r["result"] == "WARN" for r in results)
        print(f"\nDone in {time.time() - t0:.0f}s:  PASS {p}   FAIL {f}   WARN {w}   ->  {name}")


if __name__ == "__main__":
    main()
