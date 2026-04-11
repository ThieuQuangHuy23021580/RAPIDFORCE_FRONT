const changeSourceBtn = document.getElementById("changeSourceBtn");
const sourceInput = document.getElementById("sourceInput");
const inputImage = document.getElementById("inputImage");
const resultImage = document.getElementById("resultImage");
const removeBtn = document.getElementById("removeBtn");
const queueStatus = document.getElementById("queueStatus");
const resultHint = document.getElementById("resultHint");

changeSourceBtn.addEventListener("click", () => sourceInput.click());

sourceInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;

  const objectURL = URL.createObjectURL(file);
  inputImage.src = objectURL;
  resultImage.src = objectURL;
  resultHint.textContent = "Source updated";
  queueStatus.textContent = "Idle / Ready";
});

removeBtn.addEventListener("click", () => {
  removeBtn.disabled = true;
  removeBtn.textContent = "Processing...";
  queueStatus.textContent = "Running...";
  resultHint.textContent = "Removing background...";

  resultImage.style.filter = "contrast(1.15) saturate(1.05)";

  setTimeout(() => {
    resultImage.style.filter = "drop-shadow(0 16px 25px rgba(0,0,0,0.2))";
    resultHint.textContent = "Background removed (preview mode)";
    queueStatus.textContent = "Completed";
    removeBtn.disabled = false;
    removeBtn.textContent = "Remove Background";
  }, 1400);
});
