import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const directory=await mkdtemp(join(tmpdir(),'itrum-calendar-'));
after(()=>rm(directory,{recursive:true,force:true}));
const result=await build({entryPoints:['src/lib/dates.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const file=join(directory,'dates.cjs');await writeFile(file,result.outputFiles[0].contents);
const {calendarDate,businessDate,displayDate,parseCalendarInput}=createRequire(import.meta.url)(file);
test('selected local calendar day and displayed API date are stable across timezones',()=>{
    const previous=process.env.TZ;
    try{
        for(const zone of ['UTC','Europe/Moscow','America/Los_Angeles','Asia/Tokyo']){
            process.env.TZ=zone;
            assert.equal(calendarDate(new Date(2026,10,16)),'2026-11-16');
            assert.equal(displayDate('2026-11-16'),'16 ноября 2026 г.');
            assert.equal(displayDate('2026-11-16T00:00:00.000Z'),'16 ноября 2026 г.');
            assert.equal(businessDate(new Date('2026-11-16T20:59:59Z')),'2026-11-16');
            assert.equal(businessDate(new Date('2026-11-16T21:00:00Z')),'2026-11-17');
        }
    }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('manual calendar input rejects impossible/partial days and supports clearing without retaining a date',()=>{
    for(const value of ['', '1', '31.02.2028', '29.02.2027', '2028-04-31', '0000-01-01', '12/01/2028']) {
        assert.equal(parseCalendarInput(value),undefined,value);
    }
    for(const [value,expected] of [['29.02.2028','2028-02-29'],['2028-03-01','2028-03-01'],['01.01.0001','0001-01-01'],['31.12.9999','9999-12-31']]) {
        assert.equal(calendarDate(parseCalendarInput(value)),expected);
    }
});
