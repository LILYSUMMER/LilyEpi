// 헤드리스 크로미움으로 하네스를 돌려 결과를 모은다.
//   node tools/run-lab.mjs [trackers=gyro,alva,alva-fb] [scenarios=a,b,c]
// 결과: lab/results/<tracker>-<scenario>.csv / .json, 그리고 표를 stdout에 출력.
// 크로미움: PLAYWRIGHT_BROWSERS_PATH/chromium 또는 CHROME_PATH. playwright-core 필요.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(LAB, '..', '..');
const trackers = (process.argv[2] || 'gyro,alva,alva-fb').split(',');
const scenarios = (process.argv[3] || 'a,b,c').split(',');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webm': 'video/webm', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const st = await stat(p); if (!st.isFile()) throw 0;
    res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    const range = req.headers.range;
    if (range) {   // <video>는 Range 요청을 쓴다
      const [s, e] = range.replace('bytes=', '').split('-'); const start = +s, end = e ? +e : st.size - 1;
      res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`); res.setHeader('Content-Length', end - start + 1);
      res.end((await readFile(p)).subarray(start, end + 1));
    } else { res.end(await readFile(p)); }
  } catch { res.statusCode = 404; res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const exe = process.env.CHROME_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(path.join(LAB, 'results'), { recursive: true });
const rows = [];
for (const tr of trackers) for (const sc of scenarios) {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `${base}/lookdown/lab/harness.html?tracker=${tr}&scenario=${sc}&video=data/${sc}.webm&imu=data/${sc}.json&step=1&auto=1`;
  const t0 = Date.now();
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__LAB_RESULT, null, { timeout: 15 * 60 * 1000 });
  } catch (e) { console.log(`${tr}/${sc}: timeout`, errors.slice(0, 3)); await page.close(); continue; }
  const r = await page.evaluate(() => window.__LAB_RESULT);
  r.summary.wall_s = +((Date.now() - t0) / 1000).toFixed(1);
  r.summary.errors = errors.slice(0, 5);
  await writeFile(path.join(LAB, 'results', `${tr}-${sc}.csv`), r.csv);
  await writeFile(path.join(LAB, 'results', `${tr}-${sc}.json`), JSON.stringify(r.summary, null, 2));
  const s = r.summary;
  rows.push([tr, sc, s.frames, s.update_ms_avg, s.update_ms_max, s.lost_frames, s.drift_px_max, s.drift_m_max, s.err_px_avg, s.err_px_max, s.err_m_avg, s.err_m_max, s.path_m, s.scale_est, s.wall_s]);
  console.log(`${tr}/${sc}: ${s.frames}f avg ${s.update_ms_avg}ms lost ${s.lost_frames} drift ${s.drift_px_max}px/${s.drift_m_max}m err ${s.err_px_avg}px/${s.err_m_avg}m scale ${s.scale_est}` + (errors.length ? ` ERR ${errors[0].slice(0, 80)}` : ''));
  await page.close();
}
console.log('\n| tracker | scn | frames | ms avg | ms max | lost | drift px max | drift m max | err px avg | err px max | err m avg | err m max | path m | scale | wall s |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
await browser.close(); server.close();
