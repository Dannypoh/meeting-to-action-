const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const tempDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'meeting-action-'));
process.env.DATA_FILE=path.join(tempDirectory,'store.json');
fs.writeFileSync(process.env.DATA_FILE,JSON.stringify({meetings:[],tasks:[]}));
const {createServer}=require('../server');
let server,baseUrl;
test.before(async()=>{server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(tempDirectory,{recursive:true,force:true})});
async function request(url,options){const response=await fetch(`${baseUrl}${url}`,{headers:{'Content-Type':'application/json'},...options});return{response,body:await response.json()}}
test('validates required meeting fields',async()=>{const {response,body}=await request('/api/meetings/analyse',{method:'POST',body:'{}'});assert.equal(response.status,400);assert.match(body.error,/required/)});
test('creates, edits, approves, tracks, and updates a meeting',async()=>{const input={title:'Sprint review',date:'2026-10-22',inputType:'transcript',text:'We agreed on the next report.',participants:[{name:'Sam',email:'sam@example.edu',role:'Chair'}]};let result=await request('/api/meetings/analyse',{method:'POST',body:JSON.stringify(input)});assert.equal(result.response.status,201);assert.equal(result.body.demo,true);assert.equal(result.body.tasks.length,2);const meeting=result.body;result=await request(`/api/meetings/${meeting.id}`,{method:'PUT',body:JSON.stringify({minutes:'Chair-approved minutes.',tasks:meeting.tasks})});assert.equal(result.body.minutes,'Chair-approved minutes.');result=await request(`/api/meetings/${meeting.id}/approve`,{method:'POST'});assert.equal(result.body.approved,true);result=await request('/api/state');assert.equal(result.body.tasks.length,2);const task=result.body.tasks[0];result=await request(`/api/tasks/${task.id}`,{method:'PATCH',body:JSON.stringify({status:'In progress',latestUpdate:'Draft underway'})});assert.equal(result.body.status,'In progress');assert.equal(result.body.latestUpdate,'Draft underway')});
test('preserves supplied minutes verbatim',async()=>{const text='Agreed minutes:\n1. Keep this wording exactly.';const input={title:'Minutes check',date:'2026-10-22',inputType:'minutes',text,participants:[{name:'Alex',email:'alex@example.edu',role:'Chair'}]};const result=await request('/api/meetings/analyse',{method:'POST',body:JSON.stringify(input)});assert.equal(result.response.status,201);assert.equal(result.body.minutes,text)});
