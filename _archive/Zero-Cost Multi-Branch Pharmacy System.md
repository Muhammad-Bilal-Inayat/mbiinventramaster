# Zero-Cost Multi-Branch Pharmacy System

## Important reality

Software, database aur development tools free/open-source ho sakte hain. Lekin agar system internet par public website ke taur par chalana ho, to hosting, domain, SMS, WhatsApp, payment gateway ya cloud backup ka cost aa sakta hai. Bilkul zero rupees ke liye system ko existing computer/laptop par local network mein chalana hoga. Branches ek hi physical network mein hon to ye practical hai. Door-door branches ke liye free option VPN/Tailscale ka free tier ho sakta hai, lekin internet aur electricity phir bhi required hogi.

## 100% free software stack

- Operating system: Ubuntu Linux LTS; Windows par bhi development ho sakti hai.
- Frontend: React + Vite + TypeScript.
- Backend: Node.js + Express + TypeScript.
- Database: PostgreSQL; very small offline installation ke liye SQLite bhi option hai.
- UI: Tailwind CSS ya plain CSS.
- Authentication: Self-built JWT login with bcrypt password hashing.
- Reports: SQL queries + browser print/PDF; paid reporting service nahi.
- Barcode: USB barcode scanner keyboard ki tarah kaam karega; extra paid API nahi.
- Receipt: Existing thermal printer ka local print driver; printer khud free nahi hota.
- Backup: External USB drive ya second computer par PostgreSQL backup.
- Source control: Git locally; GitHub optional hai aur zaroori nahi.
- Deployment: Docker Compose ya direct Node.js/PostgreSQL installation.

## Best zero-cost architecture

Ek existing office computer ko **Local Server** banayein. PostgreSQL database aur backend us computer par chalenge. Har branch ke computers browser mein local server ka address kholenge, jaise `http://192.168.1.10:3000`.

Agar multiple branches ek hi building ya same LAN mein hain, sab users same system use kar sakte hain. Agar branches different cities mein hain, zero-cost method ke liye har branch ke computers ko Tailscale free VPN se connect kiya ja sakta hai, ya ek branch computer ko server banaya ja sakta hai. Tailscale account free limit ke andar use ho sakta hai, lekin availability aur limits time ke saath change ho sakti hain.

## Free implementation method

### Phase 1 — Local foundation

1. Existing Windows/Linux computer select karein; ideally 8 GB RAM and SSD.
2. Ubuntu LTS install karein, ya Windows par Node.js/PostgreSQL install karein.
3. Node.js, PostgreSQL, Git aur VS Code install karein.
4. `pharmacy_db` PostgreSQL database create karein.
5. Backend project create karein with modules for users, branches, medicines, batches, stock and sales.
6. React frontend create karein with login, dashboard, inventory and POS screens.

### Phase 2 — Database and security

1. Organizations, branches, users, roles and permissions tables create karein.
2. Har stock item mein `branch_id` rakhein.
3. Har medicine ke liye batch number and expiry date mandatory rakhein.
4. Stock changes ko `stock_movements` ledger mein append-only save karein.
5. Sale complete karte waqt PostgreSQL transaction and row lock use karein.
6. Passwords ko bcrypt se hash karein; plain text password kabhi save na karein.
7. Admin ko all branches, manager ko assigned branch, pharmacist/cashier ko limited permissions dein.

### Phase 3 — Core free features

- Branch management
- Medicine master
- Batch and expiry tracking
- FEFO stock suggestion
- Purchase entry
- Sales/POS
- Sales return
- Branch-to-branch transfer
- Low-stock alerts inside dashboard
- Expiry report
- Sales and profit report
- User roles
- Audit log
- Printable invoice
- CSV export/import
- Local database backup

### Phase 4 — Local deployment

Backend ko server computer ke local IP par run karein. Frontend ko build karke backend se serve karein. Router/firewall mein sirf local network access allow karein. Internet par port open na karein, kyun ke security risk hoga.

### Phase 5 — Backup

Daily command-line backup USB drive par save karein. Example:

```bash
pg_dump -U postgres pharmacy_db > pharmacy_backup_2026-11-01.sql
```

Backup file ko same computer par sirf na rakhein; USB drive ya second computer par copy karein. Weekly restore test zaroor karein.

## Kya cheezen paid nahi hongi

Koi paid SaaS subscription, paid database, paid admin template, paid cloud server, paid domain, paid SMS gateway, paid WhatsApp API, paid barcode API, paid analytics platform ya paid license use nahi hoga.

## Zero-cost limits

Free local version mein system internet ke baghair chal sakta hai, lekin server computer on rehna chahiye. Cloud hosting, remote access, SMS/WhatsApp notifications, automatic off-site backup aur online payment integration ko zero cost guarantee nahi kiya ja sakta. In features ke liye local alternatives ya manual workflows use karne honge.

## Recommended first release

Sabse pehle ek working local version banaya jaye: Login → Branches → Medicines → Batches → Inventory → Purchases → POS Sales → Transfers → Reports → Backup. Iske baad prescriptions, advanced analytics aur remote branch sync add kiya jaye.

## Color theme

Clinical Navy `#102A43`, Teal `#0F766E`, Blue `#2563EB`, Mint `#E8F3F1`, Green `#15803D`, Amber `#B45309`, Red `#C2413B`, Background `#F5F7FA` aur White cards use honge. Ye colors free hain aur kisi license ki zaroorat nahi.
