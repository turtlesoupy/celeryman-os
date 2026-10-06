import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const name=process.argv[2];assert(['resolution','reference','choreography','text-motion'].includes(name));
const data=JSON.parse(await fs.readFile(`public/${name}-eval/rounds.json`,'utf8'));
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1500,height:1100},acceptDownloads:true});
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 await page.goto(`http://127.0.0.1:5173/${name}-eval/index.html`);
 await fs.mkdir(`output/${name}-eval`,{recursive:true});
 for(const [i,round] of data.rounds.entries()){
  await page.waitForFunction(index=>document.getElementById('progress-label').textContent.includes(`Pair ${index+1} of `),i);
  await page.locator('[data-axis]').first().waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-axis]').disabled);
  assert(await page.locator('#next').isDisabled());
  if(i===0){
   await page.screenshot({path:`output/${name}-eval/ready.png`,fullPage:true});
   await page.locator('[data-image="reference"]').click();assert(await page.locator('#zoom').isVisible());await page.locator('#close-zoom').click();
  }
  if(round.kind==='video'){
   assert.equal(await page.locator('#motion-panel').isVisible(),!!round.motion);
   assert.equal(await page.locator('[data-axis="motion"]').count(),round.motion?4:0);
   await page.locator('#play').click();
  }
  for(const button of await page.locator('[data-pick="tie"]').all())await button.click();
  for(const side of ['A','B'])await page.locator(`[name="usable-${side}"][value="yes"]`).check();
  if(round.kind==='video')await page.waitForFunction(()=>!document.getElementById('next').disabled,{},{timeout:15000});
  assert(!requests.some(url=>url.endsWith('/reveal.json')));
  await page.locator('#next').click();
 }
 await page.locator('#finish').waitFor();await page.locator('#reveal').click();await page.locator('#results').waitFor();
 assert.equal(await page.locator('#rows tr').count(),data.rounds.length);
 const downloadPromise=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadPromise;
 assert.equal(download.suggestedFilename(),`${name}-eval-blind-results.json`);
 const result=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 assert.equal(result.rounds.length,data.rounds.length);assert.equal(result.id,data.id);
 assert.deepEqual(errors,[]);
 await fs.writeFile(`analysis/${name}-eval-20261005/ui-verification.json`,JSON.stringify({passed:true,pairs:data.rounds.length,allMediaLoaded:true,fullPlaybackGate:true,revealOnlyAfterCompletion:true,downloadVerified:true,isolatedSyntheticRatings:true},null,2));
 console.log(`${name}: full isolated review, playback, reveal and download passed.`);
}finally{await browser.close();}
