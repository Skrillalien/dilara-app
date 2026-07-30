const START_DATE = new Date('2026-02-12T00:00:00');

let EVENTS = [];

function updateDailyMessage() {
  
  const today = new Date();
  
    // Yılın kaçıncı günü?
  const start = new Date(today.getFullYear(), 0, 0);
  const diff = today - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  
  const index = dayOfYear % DAILY_MESSAGES.length;
  
  const message = DAILY_MESSAGES[index];
  
  document.getElementById("dailyTitle").textContent =
    message.title;
  
  document.getElementById("dailyBadge").textContent =
    message.category;
  
  document.getElementById("dailyMessage").textContent =
    message.text;
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextOccurrence(month, day) {
  const now = today();
  const year = now.getFullYear();
  let d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  // Bugün dahil, sadece dünden önce ise gelecek yıla al
  if (d < now) d = new Date(year + 1, month - 1, day);
  return d;
}

function daysUntil(date) {
  return Math.round((date - today()) / 86400000);
}

function formatDate(month, day) {
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${day} ${months[month - 1]}`;
}

function updateCounter() {
  const now = today();
  const diff = Math.floor((now - START_DATE) / 86400000);
  document.getElementById('dayCount').textContent = diff;
  document.getElementById('weekCount').textContent = Math.floor(diff / 7);
  document.getElementById('monthCount').textContent =
  calculateMonths(START_DATE, now);
}

function renderEvents() {
  const list = document.getElementById('eventsList');

  const sorted = EVENTS.map(e => {
    const next = nextOccurrence(e.month, e.day);
    const days = daysUntil(next);
    return { ...e, next, days };
  }).sort((a, b) => a.days - b.days);

  list.innerHTML = sorted.map(e => {
    const isToday = e.days === 0;
    const isSoon = e.days > 0 && e.days <= 7;
    const cls = isToday ? 'today' : isSoon ? 'soon' : '';

    const countdown = isToday
      ? `<span class="badge-today">Bugün! 🎉</span>`
      : `<div class="event-days">${e.days}</div><div class="event-days-label">gün kaldı</div>`;

    return `
      <div class="event-card ${cls}">
        <div class="event-icon">${e.emoji}</div>
        <div class="event-info">
          <div class="event-name">${e.name}</div>
          <div class="event-date">${formatDate(e.month, e.day)}</div>
        </div>
        <div class="event-countdown">${countdown}</div>
      </div>
    `;
  }).join('');
}

function loadNextEvent() {

    const today = new Date();

    let closestEvent = null;
    let minDays = Infinity;

    EVENTS.forEach(event => {

        const eventDate = new Date(
            today.getFullYear(),
            event.month - 1,
            event.day
        );

        // Bu yıl geçtiyse gelecek yılı kullan
        if (eventDate < today) {
            eventDate.setFullYear(today.getFullYear() + 1);
        }

        // Saat farkından kaynaklanan hataları önlemek için
        eventDate.setHours(0, 0, 0, 0);

        const now = new Date(today);
        now.setHours(0, 0, 0, 0);

        const diffDays = Math.round(
            (eventDate - now) / (1000 * 60 * 60 * 24)
        );

        if (diffDays < minDays) {
            minDays = diffDays;
            closestEvent = event;
        }

    });

    if (!closestEvent) return;

    document.getElementById("nextEventName").textContent =
        `${closestEvent.emoji} ${closestEvent.name}`;
    
    const eventDate = new Date(
        today.getFullYear(),
        closestEvent.month - 1,
        closestEvent.day
    );
    
    if (eventDate < today) {
        eventDate.setFullYear(today.getFullYear() + 1);
    }
    
    const dateText = eventDate.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
    
    let remainText;
    
    if (minDays === 0) {
        remainText = "Bugün 🎉";
    }
    else if (minDays === 1) {
        remainText = "Yarın";
    }
    else {
        remainText = `${minDays} gün kaldı`;
    }
    
    document.getElementById("nextEventInfo").textContent =
        `📅 ${dateText} • ${remainText}`;

}

function startMidnightUpdater() {
    const now = new Date();

    const msToMidnight =
        new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1
        ) - now;

    setTimeout(() => {

        updateCounter();
        renderEvents();
        loadNextEvent();

        setInterval(() => {
            updateCounter();
            renderEvents();
            loadNextEvent();
        }, 86400000);

    }, msToMidnight);
}

function calculateMonths(start, end){

    let months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());

    if(end.getDate() < start.getDate()){
        months--;
    }

    return months;
}

async function seedEvents() {

    const events = [
        {
            name: "Yıldönümümüz",
            emoji: "💜",
            month: 2,
            day: 12,
            repeatYearly: true
        },
        {
            name: "Dilara'nın Doğum Günü",
            emoji: "🎂",
            month: 8,
            day: 9,
            repeatYearly: true
        },
        {
            name: "Berk'in Doğum Günü",
            emoji: "🎉",
            month: 3,
            day: 15,
            repeatYearly: true
        },
        {
            name: "Cengiz'in Sahiplenme Günü",
            emoji: "🐹",
            month: 6,
            day: 25,
            repeatYearly: true
        },
        {
            name: "Cengiz'i Anma Günü",
            emoji: "🕯️",
            month: 11,
            day: 10,
            repeatYearly: true
        },
        {
            name: "Sevgililer Günü",
            emoji: "💝",
            month: 2,
            day: 14,
            repeatYearly: true
        },
        {
            name: "Kadınlar Günü",
            emoji: "🌸",
            month: 3,
            day: 8,
            repeatYearly: true
        }
    ];

    for (const event of events) {
        await window.firebase.addEvent(event);
    }

    console.log("Events eklendi.");
}

async function initEvents() {

    window.firebase.listenEvents(events => {

        EVENTS = events;

        updateCounter();
        renderEvents();
        loadNextEvent();

    });

}

function openEventForm() {

    const form = document.getElementById("eventForm");

    form.style.display =
        form.style.display === "none" ? "block" : "none";

}