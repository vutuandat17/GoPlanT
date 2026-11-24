#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_AGENT = 'GoPlantCatalogPhotoSync/1.0 (https://github.com/goplant)';

function parseArgs(argv) {
  const args = {
    url: process.env.API_URL || 'http://localhost:8082',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    token: process.env.ADMIN_TOKEN || '',
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) args.url = argv[++i];
    else if (arg === '--email' && argv[i + 1]) args.email = argv[++i];
    else if (arg === '--password' && argv[i + 1]) args.password = argv[++i];
    else if (arg === '--token' && argv[i + 1]) args.token = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
  }
  args.url = args.url.replace(/\/+$/, '');
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  return res.json();
}

function isSupportedImageUrl(url) {
  if (!url) return false;
  const clean = url.split('?')[0].toLowerCase();
  return !clean.endsWith('.svg') && !clean.endsWith('.gif') && !clean.endsWith('.webp');
}

async function findWikipediaImageUrl(scientificName) {
  const cleanName = scientificName.replace(/\s+/g, ' ').trim();
  const titleSlug = encodeURIComponent(cleanName.replace(/ /g, '_'));
  try {
    const summary = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleSlug}`);
    const candidate = summary?.thumbnail?.source || summary?.originalimage?.source;
    if (isSupportedImageUrl(candidate)) return candidate;
  } catch {
    // Fallback to search API below.
  }

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName)}&srlimit=1&format=json`;
    const search = await fetchJson(searchUrl);
    const hitTitle = search?.query?.search?.[0]?.title;
    if (hitTitle) {
      const summary = await fetchJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hitTitle.replace(/ /g, '_'))}`,
      );
      const candidate = summary?.thumbnail?.source || summary?.originalimage?.source;
      if (isSupportedImageUrl(candidate)) return candidate;
    }
  } catch {
    // Ignore and return null.
  }
  return null;
}

async function downloadImage(imageUrl) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Image download HTTP ${res.status}`);
  const contentTypeHeader = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > 5 * 1024 * 1024) {
    throw new Error(`Image size ${bytes.byteLength} bytes out of range (1..5MB)`);
  }
  let mimeType = contentTypeHeader;
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    const lower = imageUrl.toLowerCase();
    if (lower.includes('.png')) mimeType = 'image/png';
    else if (lower.includes('.jpg') || lower.includes('.jpeg')) mimeType = 'image/jpeg';
    else throw new Error(`Unsupported content-type: ${contentTypeHeader || 'unknown'}`);
  }
  return { bytes, mimeType };
}

async function loginAdmin(baseUrl, email, password) {
  const result = await fetchJson(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!result?.accessToken) throw new Error('Login did not return accessToken');
  return result.accessToken;
}

async function listAllAdminPlants(baseUrl, token) {
  const first = await fetchJson(`${baseUrl}/api/v1/admin/catalog/plants?page=0&size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let items = [...(first.items || [])];
  for (let page = 1; page < (first.totalPages || 1); page++) {
    const next = await fetchJson(`${baseUrl}/api/v1/admin/catalog/plants?page=${page}&size=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    items = [...items, ...(next.items || [])];
  }
  return items;
}

async function uploadCatalogPhoto(baseUrl, token, plantId, bytes, mimeType) {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), `catalog-${plantId}.${ext}`);
  const res = await fetch(`${baseUrl}/api/v1/admin/catalog/plants/${plantId}/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let plants = [];
  let token = args.token;

  if (args.dryRun && !token && (!args.email || !args.password)) {
    const seedPath = path.resolve(__dirname, '../src/main/resources/seed/plants.json');
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    plants = seed.map((p, idx) => ({
      id: `seed-${idx + 1}`,
      commonName: p.commonName,
      scientificName: p.scientificName,
      photoUpdatedAt: null,
    }));
    console.log(`[DRY-RUN] Loaded ${plants.length} plants from seed/plants.json`);
  } else {
    if (!token) {
      if (!args.email || !args.password) {
        console.error('Missing credentials. Provide --email and --password (or --token / --dry-run).');
        process.exit(1);
      }
      token = await loginAdmin(args.url, args.email, args.password);
    }
    plants = await listAllAdminPlants(args.url, token);
    console.log(`Loaded ${plants.length} catalog plants from ${args.url}`);
  }

  const targets = args.force ? plants : plants.filter((p) => !p.photoUpdatedAt);
  console.log(`Processing ${targets.length} plants (${plants.length - targets.length} already have photos)...`);

  let success = 0;
  const failures = [];

  for (let i = 0; i < targets.length; i++) {
    const plant = targets[i];
    try {
      const imageUrl = await findWikipediaImageUrl(plant.scientificName);
      if (!imageUrl) {
        failures.push({ commonName: plant.commonName, scientificName: plant.scientificName, reason: 'No Wikipedia image' });
        continue;
      }
      const { bytes, mimeType } = await downloadImage(imageUrl);
      if (!args.dryRun) {
        await uploadCatalogPhoto(args.url, token, plant.id, bytes, mimeType);
      }
      success += 1;
      console.log(`[${i + 1}/${targets.length}] OK: ${plant.commonName} (${plant.scientificName}) - ${bytes.byteLength} bytes (${mimeType})`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ commonName: plant.commonName, scientificName: plant.scientificName, reason });
      console.log(`[${i + 1}/${targets.length}] FAIL: ${plant.commonName} (${plant.scientificName}) - ${reason}`);
    }
    await sleep(120);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total catalog plants: ${plants.length}`);
  console.log(`Succeeded: ${success}/${targets.length}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.log('\nMissing / Failed plants:');
    for (const f of failures) {
      console.log(`- ${f.commonName} (${f.scientificName}): ${f.reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
