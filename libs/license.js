const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const LICENSE_URL = process.env.TECH_LICENSE_URL || 'http://127.0.0.1:8787';

function hwid() {
    const raw = [
        os.hostname(),
        os.userInfo().username,
        os.arch(),
        os.platform(),
        (os.cpus()[0] || {}).model || ''
    ].join('|');
    return crypto.createHash('sha256').update(raw).digest('hex');
}

function request(pathname, payload) {
    const url = new URL(pathname, LICENSE_URL);
    const data = JSON.stringify(payload);
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise((resolve) => {
        const req = lib.request(
            url,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: 8000
            },
            (res) => {
                let raw = '';
                res.on('data', (c) => (raw += c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(raw));
                    } catch {
                        resolve({ valid: false, error: 'bad license server' });
                    }
                });
            }
        );
        req.on('error', (e) => resolve({ valid: false, error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ valid: false, error: 'license server timeout' });
        });
        req.write(data);
        req.end();
    });
}

function storePath(app) {
    return path.join(app.getPath('userData'), 'techsaio-license.json');
}

function runelitePath() {
    return path.join(os.homedir(), '.runelite', 'techbot-license.json');
}
function runeliteLegacyPath() {
    return path.join(os.homedir(), '.runelite', 'techsaio-license.json');
}

function writeLocal(app, payload) {
    const body = JSON.stringify(payload, null, 2);
    try {
        fs.writeFileSync(storePath(app), body);
    } catch (_) {}
    try {
        fs.mkdirSync(path.dirname(runelitePath()), { recursive: true });
        fs.writeFileSync(runelitePath(), body);
        fs.writeFileSync(runeliteLegacyPath(), body);
    } catch (_) {}
}

function readLocal(app) {
    try {
        return JSON.parse(fs.readFileSync(storePath(app), 'utf8'));
    } catch {
        return {};
    }
}

async function activate(app, key) {
    const id = hwid();
    const result = await request('/license/activate', { key, hwid: id });
    const row = {
        key,
        hwid: id,
        valid: Boolean(result.valid),
        daysLeft: result.daysLeft || 0,
        expiresAt: result.expiresAt || 0,
        error: result.error || null,
        checkedAt: Date.now()
    };
    writeLocal(app, row);
    return row;
}

async function check(app) {
    const local = readLocal(app);
    if (!local.key) {
        return { valid: false, daysLeft: 0, error: 'no key', hwid: hwid() };
    }
    const id = hwid();
    const result = await request('/license/check', { key: local.key, hwid: id });
    const row = {
        key: local.key,
        hwid: id,
        valid: Boolean(result.valid),
        daysLeft: result.daysLeft || 0,
        expiresAt: result.expiresAt || 0,
        error: result.error || null,
        checkedAt: Date.now()
    };
    writeLocal(app, row);
    return row;
}

module.exports = { activate, check, hwid, LICENSE_URL };
