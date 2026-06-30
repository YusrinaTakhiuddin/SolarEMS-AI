const firebaseConfig = {
  apiKey: "AIzaSyB26O36TcrqpQv0qLFLtIv5pRm_FQNDcXc",
  authDomain: "solar-charging-station-fyp2.firebaseapp.com",
  databaseURL: "https://solar-charging-station-fyp2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "solar-charging-station-fyp2",
  storageBucket: "solar-charging-station-fyp2.firebasestorage.app",
};

const firebaseUser = {
  email: "esp32@solar.com",
  password: "12345678",
};

const BATTERY_CAPACITY_WH = 108;
const NOMINAL_LOAD_VOLTAGE = 12;
const READING_ROOT = "solar_station/readings";
const PREDICTION_ROOT = "solar_station/prediction/current";

const state = {
  latest: null,
  recent: [],
  today: [],
  predictionHistory: [],
  week: [0, 0, 0, 0, 0, 0, 0],
  todayChart: null,
  weeklyChart: null,
};

const $ = (id) => document.getElementById(id);

const formatNumber = (value, decimals = 1) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : "--";
};

const setText = (id, value) => {
  const element = $(id);
  if (element) element.textContent = value;
};

const clamp = (number, min, max) => Math.min(Math.max(number, min), max);

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  const database = firebase.database();

  database.ref(".info/connected").on("value", (snapshot) => {
    setConnection(snapshot.val() === true ? "online" : "offline");
  });

  firebase.auth().signInWithEmailAndPassword(firebaseUser.email, firebaseUser.password)
    .then(() => attachDataListeners(database))
    .catch(() => setConnection("offline", "Auth error"));
}

function attachDataListeners(database) {
  database.ref(READING_ROOT).limitToLast(8).on("value", (snapshot) => {
    const days = snapshot.val() || {};
    const recent = flattenReadings(days).slice(-36);
    const latest = recent[recent.length - 1];

    if (!latest) {
      setConnection("offline", "No data");
      return;
    }

    state.latest = latest;
    state.recent = recent;
    updateDashboard(latest);
  }, () => setConnection("offline", "Firebase error"));

  database.ref(PREDICTION_ROOT).on("value", (snapshot) => {
    const prediction = snapshot.val();
    if (!prediction) return;

    const mode = prediction.mode || "--";
    const modeClass = mode.toLowerCase();

    setText("predictionMode", mode);
    $("predictionMode").className = `prediction-mode ${modeClass}`;

    setText("predictionTitle", `${mode} Charging`);
    setText("predictionSummary", prediction.reason || "--");

    setText("forecastWindow", `${formatNumber(prediction.predicted_pv_power_W, 2)} W`);
    setText("pvTrend", prediction.updated_time.split(" ")[1]);
    setText("batteryTrend", `${formatNumber(prediction.latest_battery_voltage_V, 2)} V`);
    setText("aiSampleCount", "Random Forest");
    setText(
  "predictionUpdated",
  `Latest AI Prediction: ${prediction.updated_time || "--"}`
);

        renderReasons([
          prediction.reason || "Waiting for AI recommendation."
        ]);
      });

  loadChartData(database);
}

function getLatestReading(days) {
  let latest = null;

  Object.entries(days).forEach(([dateKey, times]) => {
    Object.entries(times || {}).forEach(([timeKey, reading]) => {
      const sortKey = `${dateKey}_${timeKey}`;
      if (!latest || sortKey > latest.sortKey) {
        latest = { ...reading, dateKey, timeKey, sortKey };
      }
    });
  });

  return latest;
}

function flattenReadings(days) {
  const readings = [];

  Object.entries(days).forEach(([dateKey, times]) => {
    Object.entries(times || {}).forEach(([timeKey, reading]) => {
      readings.push({ ...reading, dateKey, timeKey, sortKey: `${dateKey}_${timeKey}` });
    });
  });

  return readings.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function updateDashboard(data) {
  const pvVoltage = Number(data.pv_voltage_V) || 0;
  const pvCurrent = Number(data.pv_current_A) || 0;
  const batteryVoltage = Number(data.battery_voltage_V) || 0;
  const batteryCurrent = Number(data.battery_current_A) || 0;

  let loadCurrent = Number(data.load_current_A) || 0;

  if (Math.abs(loadCurrent) < 0.01) {
    loadCurrent = 0;
  }
  
  const pvPower = Number(data.pv_power_W) || pvVoltage * pvCurrent;
  const batteryPower = Number(data.battery_power_W) || batteryVoltage * batteryCurrent;
  const loadLevel = getLoadLevel(loadCurrent);
  const netPower = pvPower - loadPower;
  const batteryPercent = estimateBatteryPercent(batteryVoltage);
  const batteryStatus = getBatteryStatus(batteryPercent);

  const isSolarCharging =
    pvPower > 0.5 && batteryCurrent > 0.05;


  setText(
    "solarChargingStatus",
    isSolarCharging
      ? "Charging storage battery"
      : "Not charging"
  );


  const solarIcon = $("solarIcon");


  if (solarIcon) {

    solarIcon.classList.toggle(
      "charging",
      isSolarCharging
    );


    solarIcon.classList.toggle(
      "not-charging",
      !isSolarCharging
    );

  }

  // Monitoring Page - Storage Battery
  setText("batteryVoltageMonitor", `${formatNumber(batteryVoltage, 2)} V`);
  setText("batteryCurrentMonitor", `${formatNumber(batteryCurrent, 3)} A`);
  setText("batteryPowerMonitor", `${formatNumber(batteryPower, 2)} W`);
  setText("batteryPercentMonitor", `${batteryPercent}%`);

  setText("lastUpdate", `Latest live monitoring: ${formatTimestamp(data.timestamp, data.dateKey, data.timeKey)}`);
  setText("batteryStatus", batteryStatus);
  setText("batteryPercent", `${batteryPercent}%`);
  $("batteryFill").style.width = `${batteryPercent}%`;

  setText("batteryVoltage", `${formatNumber(batteryVoltage, 2)} V`);
  setText("batteryCurrent", `${formatNumber(batteryCurrent, 3)} A`);
  setText("batteryPower", `${formatNumber(batteryPower, 2)} W`);
  setText("pvPower", `${formatNumber(pvPower, 2)} W`);
  setText("irradiance", `${formatNumber(data.irradiance_Wm2, 0)} W/m2`);
  setText("temperature", `${formatNumber(data.temperature_C, 1)}°C`);
  setText("netPower", `${formatNumber(netPower, 2)} W`);

  setText("pvVoltage", `${formatNumber(pvVoltage, 2)} V`);
  setText("pvCurrent", `${formatNumber(pvCurrent, 3)} A`);
  setText("pvPowerSolar", `${formatNumber(pvPower, 2)} W`);
  setText("chargingState", pvPower > 0.5 ? "Charging" : "Idle");

  setText("loadCurrent", `${formatNumber(loadCurrent, 3)} A`);
  setText("loadLevel", loadLevel);

  updateUserStatus({
    batteryPercent,
    batteryStatus,
    temperature: Number(data.temperature_C) || 0,
    pvPower,
    netPower,
  });
}

function updateUserStatus(system) {
  let availability = "Available";
  let statusClass = "available";
  let canCharge = "Yes";
  let safety = "Normal";
  let message = "AI energy management determines charging availability based on predicted solar power, storage battery level, and ambient temperature conditions.";

  if (system.temperature >= 45) {
    availability = "Unavailable";
    statusClass = "unavailable";
    canCharge = "No";
    safety = "High ambient temperature";
    message = "Charging is limited due to high ambient temperature conditions.";
  } else if (system.batteryPercent <= 15) {
    availability = "Unavailable";
    statusClass = "unavailable";
    canCharge = "No";
    message = "Charging is not recommended because the storage battery level is critically low.";
    
  } else if (system.batteryPercent <= 30 || system.pvPower < 2 || system.netPower < -5) {
    availability = "Limited";
    statusClass = "limited";
    canCharge = "Limited";
    safety = "Use carefully";
    message = "Charging is possible, but users should expect slower charging or shorter support time.";
  }

  const panel = document.querySelector(".user-status-panel");
  panel.classList.remove("available", "limited", "unavailable");
  panel.classList.add(statusClass);

  setText("userChargingStatus", availability);
  setText("userStatusMessage", message);
  setText("userCanCharge", canCharge);
  setText("userBatteryLevel", `${system.batteryPercent}% (${system.batteryStatus})`);
  setText("userSafetyStatus", safety);
}

function normalizeReading(data) {
  const pvVoltage = Number(data.pv_voltage_V) || 0;
  const pvCurrent = Number(data.pv_current_A) || 0;
  const batteryVoltage = Number(data.battery_voltage_V) || 0;
  const batteryCurrent = Number(data.battery_current_A) || 0;

  return {
    pvPower: Number(data.pv_power_W) || pvVoltage * pvCurrent,
    batteryVoltage,
    batteryCurrent,
    irradiance: Number(data.irradiance_Wm2) || 0,
    temperature: Number(data.temperature_C) || 0,
  };
}

function renderReasons(reasons) {
  const list = $("predictionReasons");
  list.innerHTML = "";

  const items = reasons.length ? reasons : ["More readings are needed for a stronger forecast."];
  items.forEach((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    list.appendChild(item);
  });
}

function estimateBatteryPercent(voltage) {
  if (!Number.isFinite(voltage) || voltage <= 0) return 0;
  return Math.round(clamp(((voltage - 10.8) / (12.7 - 10.8)) * 100, 0, 100));
}

function getBatteryStatus(percent) {
  if (percent >= 85) return "Full";
  if (percent >= 45) return "Normal";
  if (percent >= 20) return "Low";
  return "Critical";
}

function getLoadLevel(loadCurrent) {
  if (!Number.isFinite(loadCurrent) || loadCurrent <= 0.01) return "No Load";
  if (loadCurrent < 0.10) return "Low";
  if (loadCurrent < 0.50) return "Normal";
  return "High";
}

function updateEcoImpact(totalEnergyWh) {

  // Convert Wh to kWh
  const kWh = totalEnergyWh / 1000;


  // CO2 avoided
  // 0.6 kg CO2 per kWh
  // convert kg to gram
  const co2Saved = kWh * 0.6 * 1000;


  // Estimated electricity saving
  // assume RM0.50 per kWh
  // convert RM to sen
  const greenValue = kWh * 0.50 * 100;


  setText(
    "energyGenerated",
    `${formatNumber(totalEnergyWh, 2)} Wh`
  );


  setText(
    "co2Saved",
    `${formatNumber(co2Saved, 2)} g`
  );


setText(
  "greenValue",
  `${formatNumber(greenValue, 2)} sen`
);


// Green achievement threshold
if (totalEnergyWh >= 0.1) {

  setText(
    "impactTitle",
    "Green Contributor 🌱"
  );

  setText(
    "impactMessage",
    "Your solar system has generated clean energy and reduced carbon impact."
  );

} else {

  setText(
    "impactTitle",
    "Waiting for Solar Contribution"
  );

  setText(
    "impactMessage",
    "Start generating solar energy to track your environmental impact."
  );

}

}

function formatTimestamp(timestamp, dateKey, timeKey) {
  if (timestamp) return timestamp;
  if (!dateKey || !timeKey) return "--";
  return `${dateKey} ${timeKey.replaceAll("-", ":")}`;
}

function loadChartData(database) {
  const now = new Date();
  const todayKey = formatDate(now);
  const weekKeys = getCurrentWeekKeys(now);

  // Actual PV power from ESP32 readings
  database.ref(`${READING_ROOT}/${todayKey}`).on("value", (snapshot) => {
    const readings = snapshot.val() || {};

    state.today = Object.entries(readings).map(([timeKey, data]) => ({
      time: timeKey.slice(0, 5).replace("-", ":"),
      actual: Number(data.pv_power_W) || 0,
    }));

    renderTodayChart();
  });

  // Predicted PV power from ML prediction history
  database.ref(`solar_station/prediction/history/${todayKey}`).on("value", (snapshot) => {
    const predictions = snapshot.val() || {};

    state.predictionHistory = Object.entries(predictions).map(([timeKey, data]) => ({
      time: timeKey.slice(0, 5).replace("-", ":"),
      predicted: Number(data.predicted_pv_power_W) || 0,
    }));

    renderTodayChart();
  });

  // Weekly energy
  Promise.all(weekKeys.map((dateKey) => database.ref(`${READING_ROOT}/${dateKey}`).once("value")))
    .then((snapshots) => {
      state.week = snapshots.map((snapshot) => {
        let energyWh = 0;

        snapshot.forEach((child) => {
          const data = child.val() || {};
          const power =
            Number(data.pv_power_W) ||
            (Number(data.pv_voltage_V) || 0) * (Number(data.pv_current_A) || 0);

          energyWh += power * (5 / 60);
        });

        return energyWh;
      });

      const total = state.week.reduce((sum, value) => sum + value, 0);
      setText("weekTotal", `${formatNumber(total, 2)} Wh`);
      updateEcoImpact(total);
      renderWeeklyChart();
    });
}

function renderTodayChart() {
    const canvas = $("todayChart");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = state.today.map((item) => item.time);
    const actual = state.today.map((item) => item.actual);

    const predicted = labels.map((time) => {
      const match = state.predictionHistory.find((item) => item.time === time);
      return match ? match.predicted : null;
    });

    if (state.todayChart) {
      state.todayChart.data.labels = labels;
      state.todayChart.data.datasets[0].data = actual;
      state.todayChart.data.datasets[1].data = predicted;
      state.todayChart.update();
      return;
    }

    state.todayChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Actual PV Power (W)",
            data: actual,
            tension: 0.3,
            pointRadius: 2,
          },
          {
            label: "Predicted PV Power (W)",
            data: predicted,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: chartOptions("PV Power (W)"),
    });
}

function renderWeeklyChart() {
  const canvas = $("weeklyChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (state.weeklyChart) state.weeklyChart.destroy();

  state.weeklyChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [{
        label: "Energy (Wh)",
        data: state.week,
        backgroundColor: "#2aa27d",
        borderRadius: 6,
      }],
    },
    options: chartOptions("Energy (Wh)"),
  });
}

function chartOptions(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        title: { display: true, text: yTitle },
      },
    },
  };
}

function getCurrentWeekKeys(date) {
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + index);
    return formatDate(current);
  });
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setConnection(status, label) {
  const element = $("connectionStatus");
  element.classList.remove("online", "offline");
  element.classList.add(status);
  element.querySelector("span:last-child").textContent = label || (status === "online" ? "Online" : "Offline");
}

function initNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.view;

      document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));

      button.classList.add("active");
      $(`view-${viewName}`).classList.add("active");

      if (viewName === "ai") {
        setTimeout(() => {
          renderTodayChart();
          renderWeeklyChart();
        }, 50);
      }
    });
  });
}

function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initServiceWorker();
  initFirebase();
});

window.addEventListener("load", () => {

  setTimeout(() => {

    const splash = document.getElementById("splashScreen");

    splash.style.opacity = "0";


    setTimeout(() => {

      splash.style.display = "none";

    }, 500);


  }, 2000);

});