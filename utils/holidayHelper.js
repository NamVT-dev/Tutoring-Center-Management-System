const Holidays = require('date-holidays');
const hd = new Holidays('VN');

exports.checkIsHoliday = (date) => {
  const d = new Date(date);
  const holidays = hd.isHoliday(d);
  
 
  if (holidays && holidays[0]) {
    const holiday = holidays[0];
    // console.log(`>> Phát hiện ngày lễ: ${holiday.name} vào ngày ${date}`);
    return holiday; 
  }
  
  return false;
};