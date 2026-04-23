// Cấu hình mặc định (Sẽ được ghi đè bởi localStorage nếu có)
let SCRIPT_URL = localStorage.getItem('vibe_script_url') || '';
let GEMINI_API_KEY = localStorage.getItem('vibe_gemini_key') || '';
let DEEPSEEK_API_KEY = localStorage.getItem('vibe_deepseek_key') || '';

const MAX_BATCH_SLOTS = 5;
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
let scheduleData = [];
let calendarCursor = new Date();
let editingRecordId = null;

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
        const overlapTexts = overlaps.map(o => `<span>${toTimeString(o.start)} - ${toTimeString(o.end)}</span>`).join(', ');
        
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
}

async function loadSchedule() {
    if (!SCRIPT_URL) {
        const container = document.getElementById('schedule-cards-container');
        if (container) container.innerHTML = '<div class="message info">⚠️ Bạn cần cấu hình Google Script URL trong phần Cài đặt (⚙️) để bắt đầu.</div>';
        return;
    }
    
    const container = document.getElementById('schedule-cards-container');
    if (container) {
        container.innerHTML = `
            <div class="skeleton" style="height: 100px;"></div>
            <div class="skeleton" style="height: 100px;"></div>
            <div class="skeleton" style="height: 100px;"></div>
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
    return text
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
    }
}

function saveSettings() {
    const url = document.getElementById('settingScriptUrl').value.trim();
    const gemini = document.getElementById('settingGeminiKey').value.trim();
    const deepseek = document.getElementById('settingDeepSeekKey').value.trim();
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

    // Cập nhật biến toàn cục
    SCRIPT_URL = url;
    GEMINI_API_KEY = gemini;
    DEEPSEEK_API_KEY = deepseek;

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
        d: DEEPSEEK_API_KEY
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
                
                // Cập nhật biến hiện tại
                SCRIPT_URL = decoded.u;
                GEMINI_API_KEY = decoded.g || '';
                DEEPSEEK_API_KEY = decoded.d || '';

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
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const shareConfigBtn = document.getElementById('shareConfigBtn');
    const settingsModal = document.getElementById('settingsModal');
    const gameLinkBtn = document.getElementById('gameLinkBtn');

    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => toggleSettingsModal(true));
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => toggleSettingsModal(false));
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
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
    checkUrlConfig(); // Kiểm tra cấu hình từ URL đầu tiên
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