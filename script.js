// THAY LINK NÀY BẰNG LINK WEB APP CỦA BẠN
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyE27dII-UnpkFA2_QnlQmmZByNqJXMKy9qqNErNjN9sPbat63rRAJ73-eW0oDmabqzdw/exec';
const MAX_BATCH_SLOTS = 5;
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
let scheduleData = [];
let calendarCursor = new Date();
let editingRecordId = null;

function toMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [hour, minute] = timeStr.split(':').map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return (hour * 60) + minute;
}

function toTimeString(minutes) {
    const clamped = Math.max(0, Math.min(24 * 60, minutes));
    const hour = String(Math.floor(clamped / 60)).padStart(2, '0');
    const minute = String(clamped % 60).padStart(2, '0');
    return `${hour}:${minute}`;
}

function normalizeDate(dateValue) {
    if (!dateValue) return '';
    const text = String(dateValue);
    return text.includes('T') ? text.split('T')[0] : text;
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
    const startTime = record.startTime || record.time || '';
    const availableHours = Number(record.availableHours) || 0;
    const endTime = record.endTime || calculateEndTime(startTime, availableHours);
    return {
        id: record.id || '',
        name: record.name || '',
        date: normalizeDate(record.date),
        startTime,
        endTime,
        time: startTime,
        availableHours: availableHours || calculateHours(startTime, endTime),
        note: record.note || ''
    };
}

async function apiPost(payload) {
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
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
    const todayStr = now.toISOString().split('T')[0];

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
    const date = new Date(dateStr);
    return WEEKDAY_NAMES[date.getDay()];
}

function renderScheduleCards(data) {
    const container = document.getElementById('schedule-cards-container');
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="message info">Chưa có lịch nào.</div>';
        return;
    }

    let html = '';
    const todayStr = new Date().toISOString().split('T')[0];
    
    data.forEach((item) => {
        const personClass = String(item.name).toLowerCase() === 'anh' ? 'anh' : 'em';
        const weekday = getWeekday(item.date);
        const isToday = item.date === todayStr;
        
        html += `<div class="sched-card ${isToday ? 'today-card' : ''}">
            <div class="sched-info">
                <div class="sched-date-row">
                    <span class="weekday-tag">${weekday}</span>
                    <strong>${escapeHtml(item.date)} ${isToday ? '(Hôm nay)' : ''}</strong>
                </div>
                <span class="time-text">🕒 ${escapeHtml(item.startTime)} - ${escapeHtml(item.endTime)} (${escapeHtml(item.availableHours)}h)</span>
                ${item.note ? `<span class="note">💬 ${escapeHtml(item.note)}</span>` : ''}
            </div>
            <div class="sched-actions">
                <span class="sched-tag ${personClass}">${escapeHtml(item.name)}</span>
            </div>
        </div>`;
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
        let stateClass = 'none-free';
        if (uniqueNames.length === 2) stateClass = 'both-free';
        else if (uniqueNames.length === 1) stateClass = 'one-free';
        const todayClass = date === todayStr ? 'today' : '';
        html += `<div class="calendar-day ${stateClass} ${todayClass}" data-date="${date}">${day}</div>`;
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

    const byDate = groupByDate(scheduleData);
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a)); // Newest first
    let html = '';

    dates.forEach((date) => {
        const dayRecords = byDate[date];
        const anhSegments = toSegments(dayRecords.filter((item) => item.name === 'Anh'));
        const emSegments = toSegments(dayRecords.filter((item) => item.name === 'Em'));
        const overlaps = intersectSegments(anhSegments, emSegments);
        
        if (overlaps.length === 0) return;

        const weekday = getWeekday(date);
        
        html += `<div class="timeline-day">
            <div class="timeline-day-header">
                <strong>${weekday}, ${escapeHtml(date)}</strong>
                <span class="overlap-count">${overlaps.length} khoảng trùng</span>
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
            html += `<div class="timeline-segment overlap" style="${segmentToStyle(seg)}">
                <span class="overlap-label">${toTimeString(seg.start)}</span>
            </div>`; 
        });

        html += `</div>
                <div class="timeline-labels">
                    <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html || '<div class="message info">Chưa có lịch trùng nào được tìm thấy.</div>';
}

function rerenderAllViews() {
    applyFiltersAndRender();
    renderMonthCalendar();
    renderOverlapTimeline();
}

async function loadSchedule() {
    const container = document.getElementById('schedule-cards-container');
    if (container) {
        container.innerHTML = `
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
        `;
    }
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=list`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const rawRecords = Array.isArray(data) ? data : (data.data || []);
        scheduleData = rawRecords.map(normalizeRecord).sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));

        // Use requestAnimationFrame for smoother rendering
        requestAnimationFrame(() => {
            rerenderAllViews();
        });
    } catch (error) {
        console.error('Lỗi khi tải:', error);
        if (container) container.innerHTML = '<div class="message error">Lỗi tải dữ liệu.</div>';
    }
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
        
        // Optimistic UI: Prepare local update (optional, but let's at least clear form fast)
        const result = await apiPost({ action: 'createBatch', name, date, note, slots });
        if (result.result !== 'success') throw new Error(result.error || 'Không thể lưu.');

        setMessage('success', '✅ Đã lưu thành công!');
        
        // Reset form immediately
        form.reset();
        document.getElementById('date').value = date; // Keep the same date for convenience
        document.getElementById('slotList').innerHTML = '';
        addSlotRow();
        
        // Reload in background
        loadSchedule();
    } catch (error) {
        console.error('Lỗi khi lưu:', error);
        setMessage('error', `❌ ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
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

    if (form) form.addEventListener('submit', submitForm);
    if (refreshBtn) refreshBtn.addEventListener('click', loadSchedule);
    if (slot) slot.addEventListener('change', applyQuickSlot);
    if (addSlotBtn) addSlotBtn.addEventListener('click', () => addSlotRow());
    if (filterPerson) filterPerson.addEventListener('change', applyFiltersAndRender);
    
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
            renderMonthCalendar();
        });
    }
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
            renderMonthCalendar();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
});