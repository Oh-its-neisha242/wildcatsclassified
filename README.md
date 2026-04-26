# Hi Everyone! This Is...WildcatsClassified! (with real browser-side encryption) curated by yours truly for Senior Design II!

This is really a Flask + SQLite project with an encrypted notes app with user accounts and encrypted attachments.

## What Have I Implemented/Imported/Used
- Flask app factory
- SQLite database with SQLAlchemy models
- User registration and login
- Browser-side AES-GCM note encryption, with PBKDF2 key derivation
- Browser-side attachment encryption, and browser-side decryption on download
- Attachment metadata model, and authenticated download routes
- Front-end templates and styling (catering to Wildcats!)

## Quick start for you (I don't have it running on a domain just yet but we are in progress!)
```bash 
python -m venv .venv
source .venv\Scripts\activate  #  For my Mac or Linux lovers: .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open this! http://127.0.0.1:5000

## How to use!
1. Log in (of course!)
2. On the dashboard, enter a vault passphrase and go ahead and click **Unlock in this tab**.
3. Create notes or upload attachments. The browser encrypts them before sending them to Flask.
4. Use the same passphrase to decrypt notes and attachments in the browser.

