const uploadBtn = document.getElementById("uploadBtn");
const imageInput = document.getElementById("imageInput");
const uploadZone = document.getElementById("uploadZone");
const uploadPreview = document.getElementById("uploadPreview");
const resolutionRange = document.getElementById("resolutionRange");
const foregroundRange = document.getElementById("foregroundRange");
const resolutionValue = document.getElementById("resolutionValue");
const foregroundValue = document.getElementById("foregroundValue");
const generateBtn = document.getElementById("generateBtn");
const timeValue = document.getElementById("timeValue");
const viewerMessage = document.getElementById("viewerMessage");
const verticesValue = document.getElementById("verticesValue");
const polygonsValue = document.getElementById("polygonsValue");

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderSelectedImage(file) {
  const fileURL = URL.createObjectURL(file);
  uploadPreview.src = fileURL;
  uploadPreview.style.display = "block";
}

uploadBtn.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  renderSelectedImage(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("drag-over");
  });
});

uploadZone.addEventListener("drop", (event) => {
  const droppedFile = event.dataTransfer?.files?.[0];
  if (!droppedFile || !droppedFile.type.startsWith("image/")) return;
  imageInput.files = event.dataTransfer.files;
  renderSelectedImage(droppedFile);
});

resolutionRange.addEventListener("input", () => {
  resolutionValue.textContent = `${resolutionRange.value} px`;
});

foregroundRange.addEventListener("input", () => {
  foregroundValue.textContent = Number(foregroundRange.value).toFixed(2);
});

generateBtn.addEventListener("click", () => {
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  viewerMessage.innerHTML = `<span class="material-symbols-outlined" style="font-size:60px">sync</span><p class="brand-font" style="margin:0">Generating 3D geometry...</p>`;

  let elapsedSeconds = 0;
  const timer = setInterval(() => {
    elapsedSeconds += 1;
    timeValue.textContent = formatSeconds(elapsedSeconds);
  }, 1000);

  setTimeout(() => {
    clearInterval(timer);
    const resolution = Number(resolutionRange.value);
    const ratio = Number(foregroundRange.value);
    const vertices = Math.round(resolution * 18 * (0.6 + ratio));
    const polygons = Math.round(vertices * 1.9);

    verticesValue.textContent = vertices.toLocaleString();
    polygonsValue.textContent = polygons.toLocaleString();
    viewerMessage.innerHTML = `<span class="material-symbols-outlined" style="font-size:60px;color:#0a5d4f">check_circle</span><p class="brand-font" style="margin:0;color:#0a5d4f">Generation Completed</p>`;
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate 3D Asset";
  }, 3200);
});
