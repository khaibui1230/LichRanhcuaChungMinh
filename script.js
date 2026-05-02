// Cấu hình mặc định (Sẽ được ghi đè bởi localStorage nếu có)
let SCRIPT_URL = localStorage.getItem('vibe_script_url') || '';
let GEMINI_API_KEY = localStorage.getItem('vibe_gemini_key') || '';
let DEEPSEEK_API_KEY = localStorage.getItem('vibe_deepseek_key') || '';
let ANNIVERSARY_DATE = localStorage.getItem('vibe_anniversary_date') || '';
let BIRTHDAY_ANH = localStorage.getItem('vibe_birthday_anh') || '';
let BIRTHDAY_EM = localStorage.getItem('vibe_birthday_em') || '';

// Biến quản lý thông báo cho Notes
let lastViewedNoteTime = localStorage.getItem('vibe_last_viewed_note_time') || 0;

const MAX_BATCH_SLOTS = 5;
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
let scheduleData = [];
let calendarCursor = new Date();
let editingRecordId = null;
let notesData = [];

// DỮ LIỆU CÁC NGÀY ĐẶC BIỆT TRONG NĂM
// Bạn có thể dễ dàng thêm hoặc sửa ngày ở đây (Định dạng: MM-DD)
const SPECIAL_DAYS = [
    // Sinh nhật & Kỷ niệm (Bạn hãy sửa lại cho đúng ngày của mình nhé)
    { date: '01-01', title: 'Chúc mừng Năm Mới', emoji: '🎆', type: 'holiday', suggestion: 'Cùng nhau đi xem pháo hoa và đón giao thừa nhé! 🥂' },
    { date: '02-14', title: 'Lễ Tình Nhân Valentine', emoji: '💝', type: 'holiday', suggestion: 'Một bữa tối lãng mạn dưới ánh nến và socola ngọt ngào. 🌹' },
    { date: '03-08', title: 'Quốc tế Phụ nữ', emoji: '💃', type: 'holiday', suggestion: 'Dành tặng Em những lời chúc và món quà tuyệt vời nhất. 🎁' },
    { date: '03-14', title: 'Valentine Trắng', emoji: '🤍', type: 'holiday', suggestion: 'Đáp lại tình cảm bằng những món quà màu trắng ý nghĩa.' },
    { date: '04-30', title: 'Giải phóng Miền Nam', emoji: '🇻🇳', type: 'holiday', suggestion: 'Tận hưởng kỳ nghỉ lễ dài ngày bên nhau.' },
    { date: '05-01', title: 'Quốc tế Lao động', emoji: '⚒️', type: 'holiday', suggestion: 'Cùng nhau đi du lịch ngắn ngày hoặc cafe chill.' },
    { date: '06-01', title: 'Quốc tế Thiếu nhi', emoji: '🎈', type: 'holiday', suggestion: 'Cho "em bé" của Anh đi ăn kem và dạo phố nhé.' },
    { date: '09-02', title: 'Quốc khánh Việt Nam', emoji: '🇻🇳', type: 'holiday', suggestion: 'Dạo phố phường rực rỡ cờ hoa.' },
    { date: '10-20', title: 'Phụ nữ Việt Nam', emoji: '💐', type: 'holiday', suggestion: 'Tặng hoa và cùng nhau đi ăn món Em thích nhất.' },
    { date: '10-31', title: 'Lễ hội Halloween', emoji: '🎃', type: 'holiday', suggestion: 'Hóa trang và đi chơi lễ hội hóa trang vui vẻ.' },
    { date: '11-20', title: 'Nhà giáo Việt Nam', emoji: '👨‍🏫', type: 'holiday', suggestion: 'Tri ân những người thầy cô giáo cũ.' },
    { date: '12-24', title: 'Lễ Giáng Sinh (Noel)', emoji: '🎄', type: 'holiday', suggestion: 'Đi nhà thờ ngắm hang đá và tận hưởng không khí lạnh.' }
];

// Hàm tính toán các mốc kỷ niệm (100, 200... 1000 ngày) dựa trên ngày yêu nhau
function getLoveMilestones(startDateStr) {
    if (!startDateStr) return [];
    const start = new Date(startDateStr);
    const milestones = [100, 200, 300, 400, 500, 1000, 2000, 3000, 5000];
    const results = [];

    milestones.forEach(days => {
        const milestoneDate = new Date(start);
        milestoneDate.setDate(start.getDate() + days);
        
        // Chuyển sang định dạng MM-DD để so khớp với tháng hiện tại
        const mm = String(milestoneDate.getMonth() + 1).padStart(2, '0');
        const dd = String(milestoneDate.getDate()).padStart(2, '0');
        const yyyy = milestoneDate.getFullYear();

        results.push({
            date: `${mm}-${dd}`,
            fullDate: `${yyyy}-${mm}-${dd}`,
            title: `Kỷ niệm ${days} ngày yêu nhau`,
            emoji: '💝',
            type: 'anniversary',
            suggestion: `Mốc ${days} ngày thật tuyệt vời! Hãy dành cho nhau một món quà bất ngờ nhé. 🎁`
        });
    });

    return results;
}

function toMinutes(timeStr) {
    if (!timeStr) return null;
    const str = String(timeStr).trim().toUpperCase();
    
    // Trường hợp 1: Có chứa "T" (ISO string từ Google Sheet: 1899-12-30T08:00:00.000Z)
    if (str.includes('T')) {
        const timePart = str.split('T')[1];
        const match = timePart.match(/(\d{1,2}):(\d{1,2})/);
        if (match) return (Number(match[1]) * 60) + Number(match[2]);
    }

    // Trường hợp 2: Định dạng HH:mm bình thường hoặc có AM/PM
    const matchTime = str.match(/(\d{1,2}):(\d{1,2})/);
    if (matchTime) {
        let hour = Number(matchTime[1]);
        const minute = Number(matchTime[2]);
        if (str.includes('PM') && hour < 12) hour += 12;
        if (str.includes('AM') && hour === 12) hour = 0;
        return (hour * 60) + minute;
    }

    // Trường hợp 3: Số thực (0.33333 tương ứng với 8:00 sáng)
    const num = Number(str);
    if (!Number.isNaN(num) && num > 0 && num < 1) {
        return Math.round(num * 24 * 60);
    }

    return null;
}

function toTimeString(minutes) {
    const clamped = Math.max(0, Math.min(24 * 60, minutes));
    const hour = String(Math.floor(clamped / 60)).padStart(2, '0');
    const minute = String(clamped % 60).padStart(2, '0');
    return `${hour}:${minute}`;
}

function normalizeDate(dateValue) {
    if (!dateValue) return '';
    
    const str = String(dateValue).trim();

    // Nếu backend trả về ISO "2026-04-23T17:00:00Z"
    if (str.includes('T')) {
        const d = new Date(str);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Nếu là chuỗi YYYY-MM-DD
    const matchYMD = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (matchYMD) {
        return `${matchYMD[1]}-${matchYMD[2].padStart(2, '0')}-${matchYMD[3].padStart(2, '0')}`;
    }

    // Nếu là chuỗi DD/MM/YYYY (thường gặp từ Google Sheet)
    const matchDMY = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (matchDMY) {
        return `${matchDMY[3]}-${matchDMY[2].padStart(2, '0')}-${matchDMY[1].padStart(2, '0')}`;
    }

    return str;
}

function calculateEndTime(startTime, hours) {
    const start = toMinutes(startTime);
    const duration = Number(hours) * 60;
    if (start === null || Number.isNaN(duration) || duration <= 0) return '';
    return toTimeString(start + duration);
}

function calculateHours(startTime, endTime) {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start === null || end === null || end <= start) return 0;
    return (end - start) / 60;
}

function announce(message) {
    const region = document.getElementById('liveRegion');
    if (region) region.textContent = message;
    
    // Thêm rung nhẹ trên điện thoại nếu được hỗ trợ
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10);
    }
}

function setMessage(type, text) {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) return;
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    announce(text);
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTemplateHtml(id) {
    const template = document.getElementById(id);
    return template ? template.innerHTML : '<tr><td colspan="5">Không có dữ liệu.</td></tr>';
}

function normalizeRecord(record) {
    // Ép kiểu tất cả về chuỗi để tránh lỗi định dạng
    let id = String(record.id || '');
    let name = String(record.name || '').trim();
    let date = String(record.date || '');
    let startTime = String(record.startTime || '').trim();
    let endTime = String(record.endTime || '').trim();
    let availableHours = Number(record.availableHours) || 0;
    let note = String(record.note || '');

    // Bóc tách giờ phút chuẩn xác
    const startMins = toMinutes(startTime);
    let endMins = toMinutes(endTime);
    
    if (startMins !== null) startTime = toTimeString(startMins);
    if (endMins !== null) endTime = toTimeString(endMins);

    // Chuẩn hóa tên (Anh/Em)
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

    return {
        id,
        name,
        date: normalizeDate(date),
        startTime,
        endTime,
        time: startTime,
        availableHours: availableHours || (startMins !== null && endMins !== null ? (endMins - startMins) / 60 : 0),
        note,
        createdAt: record.createdAt || '',
        updatedAt: record.updatedAt || ''
    };
}

// Hàm gửi dữ liệu POST tới Google Apps Script (Sửa lỗi CORS/Preflight)
async function apiPost(payload) {
    try {
        // GAS không hỗ trợ tốt preflight (OPTIONS) với application/json
        // Gửi dưới dạng text/plain để tránh preflight mà vẫn xử lý được JSON ở GAS
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Mạng lỗi: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Phản hồi từ server không phải JSON hợp lệ:', text);
            throw new Error('Server phản hồi sai định dạng. Hãy kiểm tra Apps Script.');
        }
    } catch (error) {
        console.error('Chi tiết lỗi API:', error);
        throw error;
    }
}

// Batch Add: mỗi ngày có thể thêm nhiều khung giờ.
function addSlotRow(defaultValues) {
    const slotList = document.getElementById('slotList');
    if (!slotList) return;
    const currentRows = slotList.querySelectorAll('.slot-row').length;
    if (currentRows >= MAX_BATCH_SLOTS) {
        setMessage('error', `Tối đa ${MAX_BATCH_SLOTS} khung giờ.`);
        return;
    }

    const template = document.getElementById('slotRowTemplate');
    const node = template.content.firstElementChild.cloneNode(true);
    const startInput = node.querySelector('.slot-start');
    const hourInput = node.querySelector('.slot-hours');

    if (defaultValues) {
        startInput.value = defaultValues.startTime || '';
        hourInput.value = defaultValues.availableHours || '';
    }

    node.querySelector('.remove-slot-btn').addEventListener('click', () => {
        node.remove();
        if (slotList.querySelectorAll('.slot-row').length === 0) addSlotRow();
    });
    slotList.appendChild(node);
}

function collectBatchSlots() {
    const slotRows = document.querySelectorAll('#slotList .slot-row');
    const slots = [];
    const selectedDate = document.getElementById('date').value;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (let i = 0; i < slotRows.length; i += 1) {
        const row = slotRows[i];
        const startTime = row.querySelector('.slot-start').value;
        const availableHours = Number(row.querySelector('.slot-hours').value);

        if (!startTime || Number.isNaN(availableHours) || availableHours <= 0) {
            throw new Error(`Giờ ${i + 1} chưa đúng.`);
        }

        // Kiểm tra nếu là ngày hôm nay, giờ bắt đầu không được trong quá khứ
        if (selectedDate === todayStr) {
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            if (toMinutes(startTime) < currentMinutes) {
                throw new Error(`Giờ ${i + 1} (${startTime}) đã trôi qua rồi.`);
            }
        }

        slots.push({
            startTime,
            availableHours,
            endTime: calculateEndTime(startTime, availableHours),
            time: startTime,
            note: ''
        });
    }
    if (slots.length === 0) throw new Error('Cần ít nhất 1 khung giờ.');
    return slots;
}

function applyQuickSlot() {
    const slotValue = document.getElementById('slot').value;
    if (!slotValue) return;
    const [startTime, availableHours] = slotValue.split('|');
    const firstRow = document.querySelector('#slotList .slot-row');
    if (!firstRow) return;
    firstRow.querySelector('.slot-start').value = startTime;
    firstRow.querySelector('.slot-hours').value = availableHours;
}

const WEEKDAY_NAMES = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function getWeekday(dateStr) {
    if (!dateStr) return '';
    // Tách chuỗi để tạo Date object theo giờ địa phương, tránh bị lệch do UTC
    const parts = String(dateStr).split(/[-/]/);
    if (parts.length < 3) return '';
    
    // Lưu ý: Tháng trong JS bắt đầu từ 0
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    return WEEKDAY_NAMES[date.getDay()];
}

function renderScheduleCards(data) {
    const container = document.getElementById('schedule-cards-container');
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="message info">Chưa có lịch nào.</div>';
        return;
    }

    const byDate = groupByDate(data);
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let html = '';
    dates.forEach(date => {
        const dayRecords = byDate[date];
        const weekday = getWeekday(date);
        const isToday = date === todayStr;

        html += `<div class="day-group">
            <div class="day-group-header ${isToday ? 'today' : ''}">
                <div class="day-title">
                    <span class="weekday-tag">${weekday}</span>
                    <strong>${date}</strong>
                    ${isToday ? '<span class="today-badge">Hôm nay</span>' : ''}
                </div>
            </div>
            <div class="day-group-cards">`;

        dayRecords.forEach(item => {
            const personClass = item.name.toLowerCase() === 'anh' ? 'anh' : 'em';
            html += `<div class="sched-card ${personClass}">
                <div class="sched-info">
                    <div class="sched-time-row">
                        <span class="person-name">${item.name}</span>
                        <span class="time-text">🕒 ${escapeHtml(item.startTime)} - ${escapeHtml(item.endTime)}</span>
                    </div>
                    ${item.note ? `<div class="note">💬 ${escapeHtml(item.note)}</div>` : ''}
                </div>
            </div>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
}

function applyFiltersAndRender() {
    const personFilter = document.getElementById('filterPerson').value;
    // const dateFilter = document.getElementById('filterDate')?.value; // Removed date filter from UI for simplicity

    let filtered = [...scheduleData];
    if (personFilter !== 'all') filtered = filtered.filter((item) => item.name === personFilter);
    
    renderScheduleCards(filtered);
}

function groupByDate(records) {
    const map = {};
    records.forEach((record) => {
        if (!map[record.date]) map[record.date] = [];
        map[record.date].push(record);
    });
    return map;
}

// Lịch tháng trực quan: tô màu theo trạng thái rảnh của 2 người.
function renderMonthCalendar() {
    const monthCalendar = document.getElementById('monthCalendar');
    const monthLabel = document.getElementById('calendarMonthLabel');
    if (!monthCalendar || !monthLabel) return;

    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    monthLabel.textContent = `Tháng ${month + 1}/${year}`;

    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dateGroup = groupByDate(scheduleData);

    let html = '';
    WEEKDAY_LABELS.forEach((label) => { html += `<div class="calendar-weekday">${label}</div>`; });
    for (let i = 0; i < startWeekday; i += 1) html += '<div class="calendar-day empty"></div>';

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const records = dateGroup[date] || [];
        const uniqueNames = [...new Set(records.map((item) => item.name))];
        
        // Kiểm tra xem ngày này có phải ngày đặc biệt không
        const monthDayStr = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const loveMilestones = getLoveMilestones(ANNIVERSARY_DATE);
        
        let specialClass = '';
        // Ưu tiên hiển thị: Sinh nhật > Kỷ niệm > Ngày lễ
        if ((BIRTHDAY_ANH && BIRTHDAY_ANH.endsWith(monthDayStr)) || (BIRTHDAY_EM && BIRTHDAY_EM.endsWith(monthDayStr))) {
            specialClass = 'sd-birthday-mark';
        } else if (loveMilestones.some(m => m.fullDate === date)) {
            specialClass = 'sd-anniversary-mark';
        } else if (SPECIAL_DAYS.some(event => event.date === monthDayStr)) {
            specialClass = 'sd-holiday-mark';
        }

        let stateClass = 'none-free';
        if (uniqueNames.length === 2) stateClass = 'both-free';
        else if (uniqueNames.length === 1) stateClass = 'one-free';
        const todayClass = date === todayStr ? 'today' : '';
        html += `<div class="calendar-day ${stateClass} ${todayClass} ${specialClass}" data-date="${date}">${day}</div>`;
    }
    monthCalendar.innerHTML = html;
}

function toSegments(records) {
    return records.map((item) => ({
        start: toMinutes(item.startTime),
        end: toMinutes(item.endTime)
    })).filter((seg) => seg.start !== null && seg.end !== null && seg.end > seg.start);
}

function intersectSegments(aSegments, bSegments) {
    const result = [];
    aSegments.forEach((a) => {
        bSegments.forEach((b) => {
            const start = Math.max(a.start, b.start);
            const end = Math.min(a.end, b.end);
            if (end > start) result.push({ start, end });
        });
    });
    return result;
}

function segmentToStyle(segment) {
    const left = (segment.start / (24 * 60)) * 100;
    const width = ((segment.end - segment.start) / (24 * 60)) * 100;
    return `left:${left}%;width:${width}%;`;
}

// Overlap timeline: mỗi ngày hiển thị các thanh của Anh, Em và phần giao nhau.
function renderOverlapTimeline() {
    const container = document.getElementById('overlapTimeline');
    if (!container) return;

    // Reset container trước khi vẽ lại
    container.innerHTML = '';

    const byDate = groupByDate(scheduleData);
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a)); // Mới nhất lên đầu
    let html = '';

    dates.forEach((date) => {
        const dayRecords = byDate[date];
        // Lọc không phân biệt hoa thường để an tâm hơn
        const anhSegments = toSegments(dayRecords.filter((item) => item.name.toLowerCase() === 'anh'));
        const emSegments = toSegments(dayRecords.filter((item) => item.name.toLowerCase() === 'em'));
        const overlaps = intersectSegments(anhSegments, emSegments);
        
        if (overlaps.length === 0) return;

        const weekday = getWeekday(date);
        const overlapTexts = overlaps.length > 0 ? overlaps.map(o => `<span>${toTimeString(o.start)} - ${toTimeString(o.end)}</span>`).join(', ') : 'Chưa có thời gian rảnh chung';
        
        html += `<div class="timeline-day">
            <div class="timeline-day-header">
                <div class="day-info">
                    <strong>${weekday}, ${escapeHtml(date)}</strong>
                    <div class="overlap-time-summary">✨ Rảnh chung: ${overlapTexts}</div>
                </div>
            </div>
            <div class="timeline-track-container">
                <div class="timeline-track main">`;
        
        anhSegments.forEach((seg) => { 
            html += `<div class="timeline-segment anh" style="${segmentToStyle(seg)}" title="Anh: ${toTimeString(seg.start)} - ${toTimeString(seg.end)}"></div>`; 
        });
        emSegments.forEach((seg) => { 
            html += `<div class="timeline-segment em" style="${segmentToStyle(seg)}" title="Em: ${toTimeString(seg.start)} - ${toTimeString(seg.end)}"></div>`; 
        });
        overlaps.forEach((seg) => { 
            html += `<div class="timeline-segment overlap" style="${segmentToStyle(seg)}"></div>`; 
        });

        html += `</div>
                <div class="timeline-labels">
                    <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html || '<div class="message info">Chưa có lịch trùng nào. Hãy rủ người ấy đăng ký cùng ngày nhé! ❤️</div>';
}

function rerenderAllViews() {
    applyFiltersAndRender();
    renderMonthCalendar();
    renderOverlapTimeline();
    renderLoveDashboard();
    renderSpecialDays(); // Cập nhật danh sách ngày đặc biệt
}

// Hàm hiển thị danh sách ngày đặc biệt trong tháng
function renderSpecialDays() {
    const listContainer = document.getElementById('specialDaysList');
    const monthLabel = document.getElementById('specialDaysMonthLabel');
    if (!listContainer || !monthLabel) return;

    const currentMonth = calendarCursor.getMonth() + 1; // 1-12
    const currentMonthStr = String(currentMonth).padStart(2, '0');
    const currentYear = calendarCursor.getFullYear();
    monthLabel.textContent = `${currentMonth}/${currentYear}`;

    // 1. Kết hợp ngày lễ cố định, mốc kỷ niệm và sinh nhật
    const loveMilestones = getLoveMilestones(ANNIVERSARY_DATE);
    
    // Thêm sinh nhật Anh/Em vào danh sách hiển thị
    const userBirthdays = [];
    if (BIRTHDAY_ANH) {
        const b = BIRTHDAY_ANH.split('-');
        userBirthdays.push({ date: `${b[1]}-${b[2]}`, title: 'Sinh nhật Anh', emoji: '🎉', type: 'birthday', suggestion: 'Chúc mừng sinh nhật Anh! Hãy cùng nhau làm điều gì đó thật đặc biệt nhé. 🎂' });
    }
    if (BIRTHDAY_EM) {
        const b = BIRTHDAY_EM.split('-');
        userBirthdays.push({ date: `${b[1]}-${b[2]}`, title: 'Sinh nhật Em', emoji: '🎂', type: 'birthday', suggestion: 'Ngày quan trọng nhất của Em! Anh sẽ chuẩn bị một bất ngờ lớn dành cho Em. 💖' });
    }

    const allEvents = [...SPECIAL_DAYS, ...loveMilestones, ...userBirthdays];

    // 2. Lọc các ngày trong tháng hiện tại
    const monthEvents = allEvents.filter(event => {
        // Nếu có fullDate (mốc kỷ niệm cụ thể), kiểm tra cả năm
        if (event.fullDate) {
            return event.fullDate.startsWith(`${currentYear}-${currentMonthStr}`);
        }
        // Nếu chỉ có date (ngày lễ hàng năm / sinh nhật), chỉ kiểm tra tháng
        return event.date.startsWith(currentMonthStr);
    });

    if (monthEvents.length === 0) {
        listContainer.innerHTML = '<div class="message info" style="font-size:0.85rem;">Tháng này không có ngày lễ hay kỷ niệm nào đặc biệt.</div>';
        return;
    }

    // 3. Sắp xếp theo ngày
    monthEvents.sort((a, b) => a.date.localeCompare(b.date));

    let html = '';
    monthEvents.forEach(event => {
        const parts = event.date.split('-');
        const eventMonth = parts[0];
        const eventDay = parts[1];
        html += `
            <div class="special-day-item ${event.type}" onclick="this.classList.toggle('active')">
                <div class="sd-date">${eventDay}/${eventMonth}</div>
                <div class="sd-icon">${event.emoji}</div>
                <div class="sd-content">
                    <div class="sd-title">${event.title}</div>
                    <div class="sd-suggestion">💡 Gợi ý: ${event.suggestion}</div>
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

function renderLoveDashboard() {
    const daysTogetherEl = document.getElementById('daysTogether');
    const daysToTetEl = document.getElementById('daysToTet');
    const daysToHolidayEl = document.getElementById('daysToHoliday');
    const holidayNameEl = document.getElementById('holidayName');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 1. Tính ngày bên nhau
    if (ANNIVERSARY_DATE) {
        const start = new Date(ANNIVERSARY_DATE);
        start.setHours(0, 0, 0, 0);
        const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        daysTogetherEl.textContent = diff >= 0 ? diff : 0;
    }

    // 2. Tính ngày đến Tết Âm Lịch (Dự đoán cơ bản)
    // Tết 2026: 17/02/2026
    // Tết 2027: 06/02/2027
    const tetDates = [
        new Date('2025-01-29'),
        new Date('2026-02-17'),
        new Date('2027-02-06')
    ];
    let nextTet = tetDates.find(d => d > now);
    if (nextTet) {
        const diff = Math.ceil((nextTet - now) / (1000 * 60 * 60 * 24));
        daysToTetEl.textContent = diff;
    }

    // 3. Tính ngày đến lễ gần nhất
    const holidays = [
        { name: 'Tết Dương Lịch', date: new Date(now.getFullYear(), 0, 1) },
        { name: 'Giải phóng MN 30/4', date: new Date(now.getFullYear(), 3, 30) },
        { name: 'Quốc tế Lao động 1/5', date: new Date(now.getFullYear(), 4, 1) },
        { name: 'Quốc khánh 2/9', date: new Date(now.getFullYear(), 8, 2) },
        { name: 'Giáng sinh 25/12', date: new Date(now.getFullYear(), 11, 25) }
    ];
    
    // Nếu lễ năm nay đã qua, tính cho năm sau
    holidays.forEach(h => {
        if (h.date < now) h.date.setFullYear(now.getFullYear() + 1);
    });

    const nextHoliday = holidays.sort((a, b) => a.date - b.date).find(h => h.date >= now);
    if (nextHoliday) {
        const diff = Math.ceil((nextHoliday.date - now) / (1000 * 60 * 60 * 24));
        daysToHolidayEl.textContent = diff;
        holidayNameEl.textContent = `Đến ${nextHoliday.name}`;
    }
}

async function loadSchedule() {
    if (!SCRIPT_URL) {
        const container = document.getElementById('schedule-cards-container');
        if (container) container.innerHTML = '<div class="message info">⚠️ Bạn cần cấu hình Google Script URL trong phần Cài đặt (⚙️) để bắt đầu.</div>';
        return;
    }
    
    // Tải đồng thời lịch và ghi chú
    Promise.all([fetchSchedule(), loadNotes()]);
}

async function fetchSchedule() {
    const container = document.getElementById('schedule-cards-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Đang tải lịch...</div>';
    
    try {
        const data = await apiPost({ action: 'list' });
        if (data && data.result === 'success') {
            const rawRecords = Array.isArray(data.data) ? data.data : [];
            scheduleData = rawRecords.map(normalizeRecord).sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
            rerenderAllViews();
        } else {
            throw new Error(data.error || data.message || 'Lỗi server');
        }
    } catch (error) {
        console.error('Lỗi tải lịch:', error);
        container.innerHTML = `<div class="message error">❌ Không thể tải lịch. ${error.message.includes('Lỗi server') ? 'Vui lòng kiểm tra cấu hình.' : ''}</div>`;
    }
}

// Biến quản lý ghi chú mở rộng
let noteFilters = {
    author: 'all',
    mood: 'all',
    search: '',
    sort: 'newest'
};

// --- LOGIC TABS ---
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Cập nhật trạng thái nút
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Hiển thị nội dung tương ứng
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === targetTab);
            });

            // Nếu mở tab Notes, xóa thông báo
            if (targetTab === 'notes-tab') {
                markNotesAsRead();
            }
        });
    });
}

function markNotesAsRead() {
    if (notesData.length > 0) {
        const latestTime = Math.max(...notesData.map(n => new Date(n.createdAt).getTime()));
        lastViewedNoteTime = latestTime;
        localStorage.setItem('vibe_last_viewed_note_time', latestTime);
        updateNoteBadge();
    }
}

function updateNoteBadge() {
    const badge = document.getElementById('noteBadge');
    if (!badge) return;

    // Đếm số ghi chú mới (có thời gian createdAt lớn hơn thời gian xem cuối cùng)
    const newNotesCount = notesData.filter(note => {
        const noteTime = new Date(note.createdAt).getTime();
        return noteTime > lastViewedNoteTime;
    }).length;

    if (newNotesCount > 0) {
        badge.textContent = newNotesCount > 9 ? '9+' : newNotesCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// --- LOGIC SỔ TAY CẢM XÚC ---
async function loadNotes() {
    const listContainer = document.getElementById('notesList');
    if (!listContainer) return;

    try {
        const data = await apiPost({ action: 'listNotes' });
        if (data && data.result === 'success') {
            notesData = Array.isArray(data.data) ? data.data : [];
            renderNotes();
            updateNoteBadge(); // Cập nhật badge sau khi tải xong ghi chú
        } else {
            throw new Error(data.error || data.message || 'Không thể tải ghi chú');
        }
    } catch (error) {
        console.error('Lỗi tải ghi chú:', error);
        listContainer.innerHTML = '<div class="message error">❌ Không thể tải ghi chú.</div>';
    }
}

function renderNotes() {
    const listContainer = document.getElementById('notesList');
    if (!listContainer) return;

    if (notesData.length === 0) {
        listContainer.innerHTML = '<div class="message info">Chưa có lời nhắn nào. Hãy là người đầu tiên viết nhé! ❤️</div>';
        return;
    }

    // 1. Áp dụng Lọc
    let filtered = notesData.filter(note => {
        const matchAuthor = noteFilters.author === 'all' || note.author === noteFilters.author;
        const matchMood = noteFilters.mood === 'all' || note.mood === noteFilters.mood;
        const matchSearch = !noteFilters.search || note.content.toLowerCase().includes(noteFilters.search.toLowerCase());
        
        // Kiểm tra lời nhắn tương lai
        let isVisible = true;
        if (note.isFuture && note.unlockDate) {
            const unlock = new Date(note.unlockDate);
            const now = new Date();
            if (now < unlock) isVisible = false;
        }

        return matchAuthor && matchMood && matchSearch && isVisible;
    });

    // 2. Áp dụng Sắp xếp
    filtered.sort((a, b) => {
        if (noteFilters.sort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
        if (noteFilters.sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
        if (noteFilters.sort === 'mood') return a.mood.localeCompare(b.mood);
        return 0;
    });

    // 3. Render Timeline
    listContainer.innerHTML = filtered.map(note => {
        const timeStr = formatRelativeTime(note.createdAt);
        const fullDateStr = new Date(note.createdAt).toLocaleDateString('vi-VN');
        const likes = note.likes || 0;
        const isRead = note.isRead || false;

        return `
            <div class="note-card" id="note-${note.id}">
                <span class="note-time-label">${fullDateStr} • ${timeStr}</span>
                <div class="note-header">
                    <div class="note-meta">
                        <span class="note-author ${note.author}">${note.author}</span>
                        <span class="note-mood">${note.mood}</span>
                    </div>
                </div>
                <div class="note-content">${formatMarkdownToHTML(note.content)}</div>
                
                <div class="note-footer-actions">
                    <div class="interaction-btns">
                        <button onclick="interactNote('${note.id}', 'like')" class="like-btn ${likes > 0 ? 'active' : ''}">
                            ❤️ <span>${likes}</span>
                        </button>
                        <button onclick="interactNote('${note.id}', 'read')" class="read-btn ${isRead ? 'active' : ''}">
                            👁️ <span>${isRead ? 'Đã xem' : 'Chưa xem'}</span>
                        </button>
                    </div>
                    <div class="note-actions">
                        <button onclick="editNote('${note.id}')" class="note-btn">Sửa</button>
                        <button onclick="deleteNote('${note.id}')" class="note-btn delete">Xóa</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Cập nhật thống kê
    renderMoodStats();
}

function renderMoodStats() {
    const statsContainer = document.getElementById('moodStats');
    if (!statsContainer) return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Lọc note trong tháng này
    const monthNotes = notesData.filter(n => {
        const d = new Date(n.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    if (monthNotes.length === 0) {
        statsContainer.innerHTML = '<small>Chưa có dữ liệu cảm xúc tháng này.</small>';
        return;
    }

    // Đếm mood
    const counts = {};
    monthNotes.forEach(n => {
        counts[n.mood] = (counts[n.mood] || 0) + 1;
    });

    const total = monthNotes.length;
    const moodColors = {
        '❤️': '#ff4757', '😊': '#2ed573', '😢': '#1e90ff', 
        '😞': '#747d8c', '🎁': '#ffa502', '🙏': '#eccc68',
        '💔': '#ff6b81', '🌈': '#70a1ff'
    };

    statsContainer.innerHTML = Object.entries(counts).map(([mood, count]) => {
        const percent = (count / total * 100).toFixed(0);
        const color = moodColors[mood] || 'var(--primary)';
        return `<div class="mood-stat-item" 
                     style="width: ${percent}%; background: ${color}" 
                     data-label="${mood} ${percent}% (${count})">
                </div>`;
    }).join('');
}

async function interactNote(id, type) {
    const note = notesData.find(n => n.id === id);
    if (!note) return;

    const payload = { action: 'updateNote', id: id };
    
    if (type === 'like') {
        payload.likes = (note.likes || 0) + 1;
    } else if (type === 'read') {
        payload.isRead = true;
    }

    try {
        const data = await apiPost(payload);
        if (data && data.result === 'success') {
            // Cập nhật local và render lại
            if (type === 'like') note.likes = payload.likes;
            if (type === 'read') note.isRead = true;
            renderNotes();
        }
    } catch (error) {
        console.error('Lỗi tương tác:', error);
    }
}

async function submitNote(e) {
    e.preventDefault();
    const id = document.getElementById('noteId').value;
    const author = document.getElementById('noteAuthor').value;
    const mood = document.getElementById('noteMood').value;
    const content = document.getElementById('noteContent').value.trim();
    const isFuture = document.getElementById('noteIsFuture').checked;
    const unlockDate = document.getElementById('noteUnlockDate').value;
    const saveBtn = document.getElementById('saveNoteBtn');

    if (!author || !content) return;
    if (isFuture && !unlockDate) {
        alert('Vui lòng chọn ngày mở lời nhắn tương lai!');
        return;
    }

    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang gửi...';

    const action = id ? 'updateNote' : 'createNote';
    const payload = { 
        action, author, mood, content,
        isFuture, unlockDate
    };
    if (id) payload.id = id;

    try {
        const data = await apiPost(payload);
        if (data && data.result === 'success') {
            resetNoteForm();
            loadNotes();
            announce(id ? 'Đã cập nhật lời nhắn!' : 'Đã gửi lời nhắn mới!');
        } else {
            // Hiển thị chi tiết lỗi nếu server trả về
            const errorMsg = data ? (data.error || data.message || 'Server không phản hồi kết quả thành công.') : 'Lỗi kết nối server.';
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error('Lỗi khi gửi note:', error);
        alert('❌ Lỗi gửi lời nhắn: ' + error.message + '\n\n(Hãy đảm bảo bạn đã cập nhật mã Apps Script mới nhất)');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

window.editNote = function(id) {
    const note = notesData.find(n => n.id === id);
    if (!note) return;

    document.getElementById('noteId').value = note.id;
    document.getElementById('noteAuthor').value = note.author;
    document.getElementById('noteMood').value = note.mood;
    const contentArea = document.getElementById('noteContent');
    contentArea.value = note.content;
    
    // Tự động giãn chiều cao khi edit
    setTimeout(() => {
        contentArea.style.height = 'auto';
        contentArea.style.height = contentArea.scrollHeight + 'px';
    }, 0);
    
    document.getElementById('saveNoteBtn').textContent = 'Cập nhật';
    document.getElementById('cancelNoteEditBtn').classList.remove('hidden');
    
    document.getElementById('notesSection').scrollIntoView({ behavior: 'smooth' });
};

window.deleteNote = async function(id) {
    if (!confirm('Bạn có chắc muốn xóa lời nhắn này không?')) return;

    try {
        const data = await apiPost({ action: 'deleteNote', id });
        if (data && data.result === 'success') {
            loadNotes();
            announce('Đã xóa lời nhắn.');
        } else {
            throw new Error(data ? (data.error || data.message || 'Lỗi khi xóa') : 'Lỗi kết nối server.');
        }
    } catch (error) {
        console.error('Lỗi khi xóa note:', error);
        alert('Lỗi khi xóa: ' + error.message);
    }
};

function resetNoteForm() {
    document.getElementById('noteId').value = '';
    const contentArea = document.getElementById('noteContent');
    contentArea.value = '';
    contentArea.style.height = 'auto'; // Reset chiều cao
    document.getElementById('noteIsFuture').checked = false;
    document.getElementById('noteUnlockDate').value = '';
    document.getElementById('noteUnlockDate').classList.add('hidden');
    document.getElementById('saveNoteBtn').textContent = 'Gửi lời nhắn';
    document.getElementById('cancelNoteEditBtn').classList.add('hidden');
}

function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Vừa xong';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
    
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function submitForm(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('scheduleForm');
    const name = document.getElementById('name').value;
    const date = document.getElementById('date').value;
    const note = document.getElementById('note').value;

    if (!name || !date) {
        setMessage('error', 'Vui lòng chọn tên và ngày.');
        return;
    }

    submitBtn.disabled = true;
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Đang lưu... ⏳';

    try {
        const slots = collectBatchSlots();
        
        const result = await apiPost({ action: 'createBatch', name, date, note, slots });
        if (result && result.result === 'success') {
            setMessage('success', '✅ Đã lưu thành công!');
            
            // Reset form immediately
            form.reset();
            document.getElementById('date').value = date; // Keep the same date for convenience
            document.getElementById('slotList').innerHTML = '';
            addSlotRow();
            
            // Reload in background
            loadSchedule();
        } else {
            throw new Error(result ? (result.error || result.message || 'Không thể lưu.') : 'Lỗi kết nối server.');
        }
    } catch (error) {
        console.error('Lỗi khi lưu:', error);
        setMessage('error', `❌ ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
}

// Logic AI và Gợi ý
async function getAISuggestions() {
    const resultDiv = document.getElementById('aiSuggestionResult');
    const suggestBtn = document.getElementById('aiSuggestBtn');
    
    if (!GEMINI_API_KEY && !DEEPSEEK_API_KEY) {
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = '⚠️ Bạn chưa cấu hình API Key cho Gemini hoặc DeepSeek. Hãy nhấn vào biểu tượng ⚙️ ở trên để cài đặt.';
        return;
    }

    const byDate = groupByDate(scheduleData);
    const realOverlaps = [];
    
    Object.keys(byDate).forEach(date => {
        const dayRecords = byDate[date];
        const anhSegments = toSegments(dayRecords.filter(item => item.name.toLowerCase() === 'anh'));
        const emSegments = toSegments(dayRecords.filter(item => item.name.toLowerCase() === 'em'));
        const dayOverlaps = intersectSegments(anhSegments, emSegments);
        dayOverlaps.forEach(o => {
            realOverlaps.push(`${getWeekday(date)} ${date}: ${toTimeString(o.start)} - ${toTimeString(o.end)}`);
        });
    });

    if (realOverlaps.length === 0) {
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = 'Hai bạn chưa có lịch rảnh chung nào để gợi ý. Hãy đăng ký thêm lịch nhé!';
        return;
    }

    suggestBtn.disabled = true;
    suggestBtn.textContent = '🤖 AI đang suy nghĩ...';
    resultDiv.classList.remove('hidden');
    resultDiv.classList.add('loading-ai');
    resultDiv.innerHTML = 'Đang tìm kiếm món ngon và địa điểm thú vị cho hai bạn...';

    const prompt = `Tôi có danh sách các khoảng thời gian rảnh chung của hai người yêu nhau như sau: ${realOverlaps.join(', ')}. 
    Hãy gợi ý 3 phương án hẹn hò cụ thể (món ăn, địa điểm hoặc hoạt động) phù hợp với các khung giờ này tại TP.HCM hoặc Hà Nội. 
    Yêu cầu: Ngôn ngữ lãng mạn, trẻ trung, có icon emoji sinh động. Trình bày ngắn gọn, dễ đọc.`;

    try {
        let aiText = '';
        
        // Thử DeepSeek trước nếu có Key
        if (DEEPSEEK_API_KEY) {
            try {
                aiText = await callDeepSeek(prompt);
            } catch (dsError) {
                console.error('DeepSeek failed, falling back to Gemini:', dsError);
                resultDiv.innerHTML = '🔄 DeepSeek có chút vấn đề (hết số dư), đang chuyển sang Gemini...';
                aiText = await callGemini(prompt);
            }
        } else {
            aiText = await callGemini(prompt);
        }

        resultDiv.classList.remove('loading-ai');
        resultDiv.innerHTML = formatMarkdownToHTML(aiText);
    } catch (error) {
        console.error('Lỗi AI tổng quát:', error);
        resultDiv.classList.remove('loading-ai');
        resultDiv.innerHTML = `❌ Lỗi AI: ${error.message}. <br><small>Vui lòng kiểm tra lại API Key hoặc thử lại sau.</small>`;
    } finally {
        suggestBtn.disabled = false;
        suggestBtn.textContent = '✨ Gợi ý hẹn hò bằng AI';
    }
}

async function callDeepSeek(prompt) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: 'Bạn là một trợ lý ảo lãng mạn, chuyên gợi ý các địa điểm hẹn hò thú vị.' },
                { role: 'user', content: prompt }
            ],
            stream: false
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function callGemini(prompt) {
    if (!GEMINI_API_KEY) throw new Error('Chưa cấu hình Gemini API Key');

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            // Nếu v1 không được, thử v1beta
            if (response.status === 404 || response.status === 400) {
                return await callGeminiBeta(prompt);
            }
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) throw new Error('Gemini không trả về kết quả');
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        return await callGeminiBeta(prompt);
    }
}

async function callGeminiBeta(prompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        // Nếu flash không được, thử pro
        return await callGeminiPro(prompt);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) return await callGeminiPro(prompt);
    return data.candidates[0].content.parts[0].text;
}

async function callGeminiPro(prompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`Gemini Pro: ${errData.error?.message || `HTTP ${response.status}`}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) throw new Error('Gemini Pro không trả về kết quả');
    return data.candidates[0].content.parts[0].text;
}

// Hàm đơn giản để chuyển đổi markdown từ AI sang HTML (xử lý xuống dòng, in đậm)
function formatMarkdownToHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // In đậm **text**
        .replace(/\*(.*?)\*/g, '<em>$1</em>')            // In nghiêng *text*
        .replace(/\n/g, '<br>');                           // Xuống dòng
}

// Quản lý Cài đặt (Settings)
function toggleSettingsModal(show) {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.toggle('hidden', !show);
    
    if (show) {
        document.getElementById('settingScriptUrl').value = SCRIPT_URL;
        document.getElementById('settingGeminiKey').value = GEMINI_API_KEY;
        document.getElementById('settingDeepSeekKey').value = DEEPSEEK_API_KEY;
        document.getElementById('settingAnniversaryDate').value = ANNIVERSARY_DATE;
        document.getElementById('settingBirthdayAnh').value = BIRTHDAY_ANH;
        document.getElementById('settingBirthdayEm').value = BIRTHDAY_EM;
    }
}

function saveSettings() {
    const url = document.getElementById('settingScriptUrl').value.trim();
    const gemini = document.getElementById('settingGeminiKey').value.trim();
    const deepseek = document.getElementById('settingDeepSeekKey').value.trim();
    const anniversary = document.getElementById('settingAnniversaryDate').value;
    const birthdayAnh = document.getElementById('settingBirthdayAnh').value;
    const birthdayEm = document.getElementById('settingBirthdayEm').value;
    const status = document.getElementById('settingsStatus');

    if (!url) {
        status.className = 'status-msg error';
        status.textContent = '❌ Google Script URL không được để trống!';
        return;
    }

    // Lưu vào LocalStorage
    localStorage.setItem('vibe_script_url', url);
    localStorage.setItem('vibe_gemini_key', gemini);
    localStorage.setItem('vibe_deepseek_key', deepseek);
    localStorage.setItem('vibe_anniversary_date', anniversary);
    localStorage.setItem('vibe_birthday_anh', birthdayAnh);
    localStorage.setItem('vibe_birthday_em', birthdayEm);

    // Cập nhật biến toàn cục
    SCRIPT_URL = url;
    GEMINI_API_KEY = gemini;
    DEEPSEEK_API_KEY = deepseek;
    ANNIVERSARY_DATE = anniversary;
    BIRTHDAY_ANH = birthdayAnh;
    BIRTHDAY_EM = birthdayEm;

    status.className = 'status-msg success';
    status.textContent = '✅ Đã lưu cấu hình!';

    setTimeout(() => {
        toggleSettingsModal(false);
        loadSchedule();
    }, 1000);
}

function shareConfig() {
    const status = document.getElementById('settingsStatus');
    if (!SCRIPT_URL) {
        status.className = 'status-msg error';
        status.textContent = '❌ Cần lưu cấu hình trước khi chia sẻ!';
        return;
    }

    const config = {
        u: SCRIPT_URL,
        g: GEMINI_API_KEY,
        d: DEEPSEEK_API_KEY,
        a: ANNIVERSARY_DATE,
        ba: BIRTHDAY_ANH,
        be: BIRTHDAY_EM
    };

    // Mã hóa base64 đơn giản để gửi qua URL
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
    const shareUrl = `${window.location.origin}${window.location.pathname}?c=${encoded}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
        status.className = 'status-msg success';
        status.textContent = '📋 Đã sao chép link chia sẻ! Hãy gửi nó cho người ấy.';
    }).catch(err => {
        console.error('Không thể sao chép:', err);
        status.className = 'status-msg error';
        status.textContent = '❌ Lỗi khi sao chép link.';
    });
}

function checkUrlConfig() {
    const params = new URLSearchParams(window.location.search);
    const configData = params.get('c');

    if (configData) {
        try {
            const decoded = JSON.parse(decodeURIComponent(escape(atob(configData))));
            if (decoded.u) {
                localStorage.setItem('vibe_script_url', decoded.u);
                localStorage.setItem('vibe_gemini_key', decoded.g || '');
                localStorage.setItem('vibe_deepseek_key', decoded.d || '');
                localStorage.setItem('vibe_anniversary_date', decoded.a || '');
                localStorage.setItem('vibe_birthday_anh', decoded.ba || '');
                localStorage.setItem('vibe_birthday_em', decoded.be || '');
                
                // Cập nhật biến hiện tại
                SCRIPT_URL = decoded.u;
                GEMINI_API_KEY = decoded.g || '';
                DEEPSEEK_API_KEY = decoded.d || '';
                ANNIVERSARY_DATE = decoded.a || '';
                BIRTHDAY_ANH = decoded.ba || '';
                BIRTHDAY_EM = decoded.be || '';

                // Xóa tham số trên URL cho sạch sẽ
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Hiển thị thông báo chào mừng
                setTimeout(() => {
                    setMessage('success', '💕 Đã tự động cấu hình từ link chia sẻ của người ấy!');
                }, 1000);
            }
        } catch (e) {
            console.error('Lỗi khi giải mã cấu hình URL:', e);
        }
    }
}

function bindEvents() {
    const form = document.getElementById('scheduleForm');
    const refreshBtn = document.getElementById('refreshBtn');
    const slot = document.getElementById('slot');
    const addSlotBtn = document.getElementById('addSlotBtn');
    const filterPerson = document.getElementById('filterPerson');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const aiSuggestBtn = document.getElementById('aiSuggestBtn');

    // Settings Modal Events
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsForm = document.getElementById('settingsForm');
    const shareConfigBtn = document.getElementById('shareConfigBtn');
    const settingsModal = document.getElementById('settingsModal');
    const gameLinkBtn = document.getElementById('gameLinkBtn');

    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => toggleSettingsModal(true));
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => toggleSettingsModal(false));
    if (settingsForm) settingsForm.addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });
    if (shareConfigBtn) shareConfigBtn.addEventListener('click', shareConfig);
    if (gameLinkBtn) gameLinkBtn.addEventListener('click', () => window.open('https://couple-question-game.vercel.app/', '_blank'));
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) toggleSettingsModal(false);
        });
    }

    if (form) form.addEventListener('submit', submitForm);
    if (refreshBtn) refreshBtn.addEventListener('click', loadSchedule);
    if (slot) slot.addEventListener('change', applyQuickSlot);
    if (addSlotBtn) addSlotBtn.addEventListener('click', () => addSlotRow());
    if (filterPerson) filterPerson.addEventListener('change', applyFiltersAndRender);
    if (aiSuggestBtn) aiSuggestBtn.addEventListener('click', getAISuggestions);
    
    // Notes Events
    const noteForm = document.getElementById('noteForm');
    const cancelNoteEditBtn = document.getElementById('cancelNoteEditBtn');
    if (noteForm) noteForm.addEventListener('submit', submitNote);
    if (cancelNoteEditBtn) cancelNoteEditBtn.addEventListener('click', resetNoteForm);

    // Advanced Notes Events
    const noteSearch = document.getElementById('noteSearch');
    const filterNoteAuthor = document.getElementById('filterNoteAuthor');
    const filterNoteMood = document.getElementById('filterNoteMood');
    const sortNote = document.getElementById('sortNote');
    const noteIsFuture = document.getElementById('noteIsFuture');

    if (noteSearch) {
        noteSearch.addEventListener('input', (e) => {
            noteFilters.search = e.target.value;
            renderNotes();
        });
    }
    if (filterNoteAuthor) {
        filterNoteAuthor.addEventListener('change', (e) => {
            noteFilters.author = e.target.value;
            renderNotes();
        });
    }
    if (filterNoteMood) {
        filterNoteMood.addEventListener('change', (e) => {
            noteFilters.mood = e.target.value;
            renderNotes();
        });
    }
    if (sortNote) {
        sortNote.addEventListener('change', (e) => {
            noteFilters.sort = e.target.value;
            renderNotes();
        });
    }
    if (noteIsFuture) {
        noteIsFuture.addEventListener('change', (e) => {
            const dateInput = document.getElementById('noteUnlockDate');
            if (dateInput) {
                dateInput.classList.toggle('hidden', !e.target.checked);
                if (e.target.checked) {
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    dateInput.value = nextWeek.toISOString().split('T')[0];
                }
            }
        });
    }

    const noteContent = document.getElementById('noteContent');
    if (noteContent) {
        noteContent.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
            rerenderAllViews();
        });
    }
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
            rerenderAllViews();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        checkUrlConfig(); // Kiểm tra cấu hình từ URL đầu tiên
        initTabs(); // Khởi tạo tính năng Tab
        const dateInput = document.getElementById('date');
        if (dateInput) {
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            dateInput.value = todayStr;
            dateInput.min = todayStr; // Ngăn chọn ngày trong quá khứ
        }

        bindEvents();
        addSlotRow();
        loadSchedule();
    } catch (error) {
        console.error('Lỗi khởi tạo ứng dụng:', error);
    }
});