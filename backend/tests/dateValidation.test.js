const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isValidDateRange,businessDate}=require('../utils/dateValidation');

test('calendar ranges compare calendar days while retaining legacy ISO input',()=>{
    assert.equal(isValidDateRange('2026-11-16','2026-11-16'),true);
    assert.equal(isValidDateRange('2026-11-16T23:59:59-05:00','2026-11-16T00:00:00+03:00'),true);
    assert.equal(isValidDateRange('2026-11-17','2026-11-16'),false);
    assert.equal(isValidDateRange('2026-02-30','2026-03-01'),false);
});
test('business today changes at Moscow midnight regardless of process timezone',()=>{
    const previous=process.env.TZ;
    try {
        for (const zone of ['UTC','America/Los_Angeles','Asia/Tokyo']) {
            process.env.TZ=zone;
            assert.equal(businessDate(new Date('2026-11-16T20:59:59Z')),'2026-11-16');
            assert.equal(businessDate(new Date('2026-11-16T21:00:00Z')),'2026-11-17');
            assert.equal(businessDate(new Date('2024-02-28T21:00:00Z')),'2024-02-29');
        }
    } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
