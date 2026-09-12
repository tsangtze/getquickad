function uiText(key, fallback, params = {}) {
  const translated = window.QuickAdI18n?.t?.(key, params);
  if (!translated || translated === key) {
    return fallback;
  }
  return translated;
}

let quickAdAudioContext = null;

function quickAdAudio() {
  if (!quickAdAudioContext) {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    quickAdAudioContext =
      new AudioContextClass();
  }

  if (quickAdAudioContext.state === "suspended") {
    quickAdAudioContext.resume().catch(() => {});
  }

  return quickAdAudioContext;
}

function playQuickAdTone(
  frequency,
  duration,
  volume,
  delay = 0
) {
  const audio = quickAdAudio();

  if (!audio) {
    return;
  }

  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(
    frequency,
    start
  );

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(
    volume,
    start + 0.01
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    start + duration
  );

  oscillator.connect(gain);
  gain.connect(audio.destination);

  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playQuickAdSound(type) {
  try {
    if (type === "click") {
      playQuickAdTone(520, 0.045, 0.025);
      return;
    }

    if (type === "plan-ready") {
      playQuickAdTone(660, 0.12, 0.055);
      playQuickAdTone(880, 0.18, 0.05, 0.11);
      return;
    }

    if (type === "video-ready") {
      playQuickAdTone(523.25, 0.12, 0.055);
      playQuickAdTone(659.25, 0.14, 0.055, 0.10);
      playQuickAdTone(783.99, 0.22, 0.06, 0.21);
    }
  } catch {}
}

document.addEventListener("click", (event) => {
  const interactive = event.target.closest(
    'button, a, input[type="radio"], input[type="checkbox"], select, label'
  );

  if (!interactive) {
    return;
  }

  if (
    interactive.matches(":disabled") ||
    interactive.getAttribute("aria-disabled") === "true"
  ) {
    return;
  }

  playQuickAdSound("click");
});


const MAX_IMAGES = 10;

const IMAGE_LIMITS_BY_DURATION = {
  30: 5,
  45: 7,
  60: 10
};

function getSelectedDurationChoice() {
  const selected =
    document.querySelector(
      'input[name="maxDurationSeconds"]:checked'
    );

  const value =
    String(selected?.value || "auto");

  if (value === "auto") {
    return "auto";
  }

  const duration =
    Number(value);

  return [30, 45, 60].includes(duration)
    ? duration
    : "auto";
}

function getSelectedDurationSeconds() {
  const choice =
    getSelectedDurationChoice();

  return choice === "auto"
    ? null
    : choice;
}

function getPlanImageLimit() {
  if (currentPlanMaxVideoSeconds >= 60) {
    return IMAGE_LIMITS_BY_DURATION[60];
  }

  if (currentPlanMaxVideoSeconds >= 45) {
    return IMAGE_LIMITS_BY_DURATION[45];
  }

  return IMAGE_LIMITS_BY_DURATION[30];
}

function getSelectedImageLimit() {
  const choice =
    getSelectedDurationChoice();

  if (choice === "auto") {
    return getPlanImageLimit();
  }

  return (
    IMAGE_LIMITS_BY_DURATION[choice] ??
    getPlanImageLimit()
  );
}

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const createVideoNav =
  document.querySelector("#create-video-nav");

const myVideosNav =
  document.querySelector("#my-videos-nav");

const createView =
  document.querySelector("#create-view");

const myVideosView =
  document.querySelector("#my-videos-view");

const myVideosContent =
  document.querySelector("#my-videos-content");

let myVideosLoadPromise = null;

function formatRecoveryTimeRemaining(expiresAt) {
  const expiration =
    new Date(expiresAt);

  if (Number.isNaN(expiration.getTime())) {
    return null;
  }

  const remainingMs =
    expiration.getTime() - Date.now();

  if (remainingMs <= 0) {
    return { expired: true, hours: 0, minutes: 0 };
  }

  const totalMinutes =
    Math.ceil(remainingMs / 60000);

  const hours =
    Math.floor(totalMinutes / 60);

  const minutes =
    totalMinutes % 60;

  return { expired: false, hours, minutes };
}

let latestRecoverableVideos = null;

function renderRecoverableVideos(videos) {
  if (!myVideosContent) {
    return;
  }

  myVideosContent.replaceChildren();

  if (!Array.isArray(videos) || videos.length === 0) {
    const empty =
      document.createElement("p");

    empty.id = "my-videos-placeholder";
    empty.textContent =
      uiText("videos.empty", "You do not have any videos available for recovery.");

    myVideosContent.append(empty);
    return;
  }

  const list =
    document.createElement("div");

  list.id = "my-videos-list";

  for (const video of videos) {
    const item =
      document.createElement("article");

    item.className = "my-video-item";
    item.dataset.projectId =
      String(video.projectId ?? "");

    const thumbnail =
      document.createElement("div");

    thumbnail.className =
      "my-video-thumbnail";

    const thumbnailUrl =
      String(video.thumbnailUrl ?? "").trim();

    if (thumbnailUrl) {
      const image =
        document.createElement("img");

      image.src = thumbnailUrl;
      image.alt = "";
      image.loading = "lazy";

      image.addEventListener(
        "error",
        () => {
          image.remove();

          const fallback =
            document.createElement("span");

          fallback.className =
            "my-video-thumbnail-fallback";

          fallback.textContent =
            "QuickAd AI";

          thumbnail.append(fallback);
        },
        {
          once: true
        }
      );

      thumbnail.append(image);
    } else {
      const fallback =
        document.createElement("span");

      fallback.className =
        "my-video-thumbnail-fallback";

      fallback.textContent =
        "QuickAd AI";

      thumbnail.append(fallback);
    }

    const details =
      document.createElement("div");

    details.className =
      "my-video-details";

    const title =
      document.createElement("h2");

    title.className =
      "my-video-title";

    title.textContent =
      String(video.title ?? "").trim() ||
      "QuickAd Video";

    const created =
      document.createElement("p");

    created.className =
      "my-video-meta";

    const readyAt =
      new Date(video.readyAt);

    created.textContent =
      Number.isNaN(readyAt.getTime())
        ? uiText("videos.created", "Created")
        : uiText("videos.created_at", "Created: {date}", { date: readyAt.toLocaleString() });

    const expires =
      document.createElement("p");

    expires.className =
      "my-video-meta";

    const recoveryTime =
      formatRecoveryTimeRemaining(
        video.expiresAt
      );

    expires.textContent =
      recoveryTime === null
        ? uiText(
            "videos.expiration_unavailable",
            "Recovery expiration unavailable"
          )
        : recoveryTime.expired
          ? uiText("videos.expired", "Expired")
          : uiText(
              "videos.available_for",
              "Available for: {hours}h {minutes}m",
              {
                hours: recoveryTime.hours,
                minutes: recoveryTime.minutes
              }
            );

    const actions =
      document.createElement("div");

    actions.className =
      "my-video-actions";

    const watchUrl =
      String(video.watchUrl ?? "").trim();

    if (watchUrl) {
      const watch =
        document.createElement("a");

      watch.className =
        "my-video-action";

      watch.href = watchUrl;
      watch.target = "_blank";
      watch.rel = "noopener";
      watch.textContent = uiText("result.watch", "Watch Video");

      actions.append(watch);
    }

    const downloadUrl =
      String(video.downloadUrl ?? "").trim();

    if (downloadUrl) {
      const download =
        document.createElement("a");

      download.className =
        "my-video-action";

      download.href = downloadUrl;
      download.textContent =
        uiText("result.download", "Download MP4");

      actions.append(download);
    }

    const projectId =
      String(video.projectId ?? "").trim();

    if (projectId) {
      const deleteButton =
        document.createElement("button");

      deleteButton.type = "button";
      deleteButton.className =
        "my-video-action my-video-delete";
      deleteButton.textContent =
        uiText("videos.delete", "Delete");

      deleteButton.addEventListener(
        "click",
        () => {
          void deleteRecoverableVideo(
            projectId,
            title.textContent
          );
        }
      );

      actions.append(deleteButton);
    }

    details.append(
      title,
      created,
      expires,
      actions
    );

    item.append(
      thumbnail,
      details
    );

    list.append(item);
  }

  myVideosContent.append(list);
}

async function deleteRecoverableVideo(projectId, title) {
  const id = String(projectId ?? "").trim();

  if (!id) {
    return;
  }

  const videoTitle =
    String(title ?? "").trim() ||
    uiText(
      "videos.this_video",
      "this video"
    );

  const confirmed =
    window.confirm(
      uiText(
        "videos.delete_confirm",
        `Delete "{title}"?

This video will be permanently deleted and cannot be recovered.

Deleting it does not refund credits or restore a free video.`,
        { title: videoTitle }
      )
    );

  if (!confirmed) {
    return;
  }

  try {
    const response =
      await fetch(
        `/api/projects/${encodeURIComponent(id)}/video`,
        {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store"
        }
      );

    const payload =
      await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.error ||
          uiText("videos.delete_failed", "Unable to delete this video.")
      );
    }

    await loadRecoverableVideos();
  } catch (error) {
    console.error(
      "Unable to delete recoverable video:",
      error
    );

    window.alert(
      error?.message ||
        uiText("videos.delete_retry", "Unable to delete this video. Please try again.")
    );
  }
}

async function loadRecoverableVideos() {
  if (!myVideosContent) {
    return;
  }

  myVideosContent.replaceChildren();

  const loading =
    document.createElement("p");

  loading.id = "my-videos-placeholder";
  loading.textContent =
    "Loading your videos...";

  myVideosContent.append(loading);

  try {
    const response =
      await fetch(
        "/api/projects/videos/recoverable",
        {
          credentials: "same-origin",
          cache: "no-store"
        }
      );

    const payload =
      await response.json().catch(
        () => null
      );

    if (
      !response.ok ||
      !payload?.ok ||
      !Array.isArray(payload.videos)
    ) {
      throw new Error(
        payload?.error ||
          "Unable to load your videos."
      );
    }

    latestRecoverableVideos =
      payload.videos;

    renderRecoverableVideos(
      latestRecoverableVideos
    );
  } catch (error) {
    console.error(
      "Unable to load recoverable videos:",
      error
    );

    myVideosContent.replaceChildren();

    const failure =
      document.createElement("p");

    failure.id = "my-videos-placeholder";
    failure.textContent =
      "Unable to load your videos. Please try again.";

    myVideosContent.append(failure);
  }
}

function ensureRecoverableVideosLoaded() {
  if (!myVideosLoadPromise) {
    myVideosLoadPromise =
      loadRecoverableVideos()
        .finally(() => {
          myVideosLoadPromise = null;
        });
  }

  return myVideosLoadPromise;
}

function showCreateVideoView({
  updateHistory = true
} = {}) {
  if (!createView || !myVideosView) {
    return;
  }

  createView.hidden = false;
  myVideosView.hidden = true;

  createVideoNav?.classList.add("active");
  myVideosNav?.classList.remove("active");

  if (
    updateHistory &&
    window.location.hash === "#my-videos"
  ) {
    window.history.pushState(
      null,
      "",
      window.location.pathname +
        window.location.search
    );
  }
}

function showMyVideosView({
  updateHistory = true
} = {}) {
  if (!createView || !myVideosView) {
    return;
  }

  createView.hidden = true;
  myVideosView.hidden = false;

  createVideoNav?.classList.remove("active");
  myVideosNav?.classList.add("active");

  void ensureRecoverableVideosLoaded();

  if (
    updateHistory &&
    window.location.hash !== "#my-videos"
  ) {
    window.history.pushState(
      null,
      "",
      window.location.pathname +
        window.location.search +
        "#my-videos"
    );
  }
}

function isCreateVideoPath(pathname) {
  if (
    pathname === "/" ||
    pathname === "/index.html"
  ) {
    return true;
  }

  const normalized =
    pathname.replace(/^\/|\/$/g, "");

  return Boolean(
    window.QuickAdI18n?.supportedLangs?.[normalized]
  );
}

createVideoNav?.addEventListener(
  "click",
  event => {
    if (isCreateVideoPath(window.location.pathname)) {
      event.preventDefault();
      showCreateVideoView();
    }
  }
);

myVideosNav?.addEventListener(
  "click",
  event => {
    event.preventDefault();
    showMyVideosView();
  }
);

window.addEventListener(
  "popstate",
  () => {
    if (window.location.hash === "#my-videos") {
      showMyVideosView({
        updateHistory: false
      });
      return;
    }

    showCreateVideoView({
      updateHistory: false
    });
  }
);

if (window.location.hash === "#my-videos") {
  showMyVideosView({
    updateHistory: false
  });
}

const videoRecoveryLimitDialog =
  document.querySelector(
    "#video-recovery-limit-dialog"
  );

const videoRecoveryLimitTitle =
  document.querySelector(
    "#video-recovery-limit-title"
  );

const videoRecoveryLimitMessage =
  document.querySelector(
    "#video-recovery-limit-message"
  );

const videoRecoveryLimitCancel =
  document.querySelector(
    "#video-recovery-limit-cancel"
  );

const videoRecoveryLimitManage =
  document.querySelector(
    "#video-recovery-limit-manage"
  );

function showVideoRecoveryLimitDialog(limit = 10) {
  const safeLimit =
    Number.isFinite(Number(limit)) &&
    Number(limit) > 0
      ? Number(limit)
      : 10;

  if (
    !videoRecoveryLimitDialog ||
    typeof videoRecoveryLimitDialog.showModal !==
      "function"
  ) {
    return;
  }

  if (videoRecoveryLimitTitle) {
    videoRecoveryLimitTitle.textContent =
      uiText(
        "videos.limit_title",
        "Video storage limit reached"
      );
  }

  if (videoRecoveryLimitMessage) {
    videoRecoveryLimitMessage.textContent =
      uiText(
        "videos.limit_message",
        "You already have {limit} videos available for recovery. Delete one video from My Videos before creating another.",
        { limit: safeLimit }
      );
  }

  if (!videoRecoveryLimitDialog.open) {
    videoRecoveryLimitDialog.showModal();
  }
}

videoRecoveryLimitCancel?.addEventListener(
  "click",
  () => {
    videoRecoveryLimitDialog?.close();
  }
);

videoRecoveryLimitManage?.addEventListener(
  "click",
  () => {
    videoRecoveryLimitDialog?.close();
    showMyVideosView();
  }
);

const form = document.querySelector("#video-form");
const imageInput = document.querySelector("#product-images");
const logoInput = document.querySelector("#product-logo");
const ctaImageInput = document.querySelector("#cta-image");
const uploadZone = document.querySelector("#upload-zone");
const previewList = document.querySelector("#image-preview-list");
const imageCount = document.querySelector("#image-count");
const uploadDescription =
  document.querySelector("#upload-description");
const uploadFormats =
  document.querySelector("#upload-formats");
const logoName = document.querySelector("#logo-name");
const ctaImageName = document.querySelector("#cta-image-name");
const logoPreview = document.querySelector("#logo-preview");
const logoPreviewImage = document.querySelector("#logo-preview-image");
const ctaImagePreview = document.querySelector("#cta-image-preview");
const ctaImagePreviewImage = document.querySelector("#cta-image-preview-image");
const removeLogoButton = document.querySelector("#remove-logo");
const removeCtaImageButton = document.querySelector("#remove-cta-image");
const description = document.querySelector("#productDesc");

function resizeProductDescription() {
  if (!description) {
    return;
  }

  description.style.height = "auto";
  description.style.height = `${description.scrollHeight}px`;
}
const websiteInput = document.querySelector("#website");
const websiteCount = document.querySelector("#website-count");
const characterCount = document.querySelector("#character-count");

const updateCreateWebsiteCounter = () => {
  if (!websiteInput || !websiteCount) {
    return;
  }

  websiteCount.textContent =
    uiText(
      "scene.caption_count",
      `${websiteInput.value.length} / 60 characters`,
      {
        count: websiteInput.value.length,
        max: 60
      }
    );
};

websiteInput?.addEventListener(
  "input",
  updateCreateWebsiteCounter
);

updateCreateWebsiteCounter();
const uploadError = document.querySelector("#upload-error");
const descriptionError = document.querySelector("#description-error");
const formMessage = document.querySelector("#form-message");
const createButton = document.querySelector("#create-button");

const styleOptions = [...document.querySelectorAll(".style-option")];
const styleSection =
  document.querySelector("#style-section");
const styleSetupHome =
  styleSection?.parentElement ?? null;
const planStyleHost =
  document.querySelector("#plan-style-host");
const planReview = document.querySelector("#plan-review");
const planBrandingReview =
  document.querySelector("#plan-branding-review");
const planBrandingContent =
  document.querySelector("#plan-branding-content");
const durationFieldset =
  document.querySelector("#duration-options");
const durationSetupHome =
  durationFieldset?.parentElement ?? null;
const planDurationHost =
  document.querySelector("#plan-duration-host");
const setupAudioHost =
  document.querySelector("#setup-audio-host");
const narratorSection =
  document.querySelector(".narrator-section");
const musicSection =
  document.querySelector(".music-section");
const regeneratePlanButton =
  document.querySelector("#regenerate-plan-button");
const durationOptions = [...document.querySelectorAll(".duration-option")];
const planScenes = document.querySelector("#plan-scenes");
const planStatus = document.querySelector("#plan-status");
const durationReviewSummary =
  document.querySelector(
    "#duration-review-summary"
  );
const callToActionSelect =
  document.querySelector(
    "#call-to-action"
  );

const customCtaField =
  document.querySelector(
    "#custom-cta-field"
  );

const customCtaInput =
  document.querySelector(
    "#custom-call-to-action"
  );

const customCtaCount =
  document.querySelector(
    "#custom-cta-count"
  );

const customCtaError =
  document.querySelector(
    "#custom-cta-error"
  );

const finalVideoButton = document.querySelector("#final-video-button");
const undoSceneButton = document.querySelector("#undo-scene-button");
const sceneCountMessage = document.querySelector("#scene-count-message");
const narratorOptions = [
  ...document.querySelectorAll(
    'input[name="narratorVoice"]'
  )
];

let selectedImages = [];
let currentPlanMaxVideoSeconds = 30;
let currentPlanId = "free";
let currentProjectId = "";
let websiteConfirmationRequired = false;
let currentStoryboard = null;
let reviewImageUrls = [];
let reviewCtaImageUrl = "";
let reviewDefaultCtaImageUrl = "";
let reviewUploadedCtaImageUrl = "";
let reviewCtaImageSource = "default";
let currentReviewImageCount = 0;

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function setUploadError(message = "") {
  uploadError.textContent = message;
}

function syncImageInput() {
  const transfer = new DataTransfer();

  selectedImages.forEach((file) => {
    transfer.items.add(file);
  });

  imageInput.files = transfer.files;
}

function getEffectiveImageCount() {
  return selectedImages.length;
}

function updateDurationAvailability() {
  const imageCount = getEffectiveImageCount();

  durationOptions.forEach((option) => {
    const radio =
      option.querySelector('input[type="radio"]');

    if (!radio) {
      return;
    }

    const value = String(radio.value);

    if (value === "auto") {
      radio.disabled = false;
      option.classList.remove("locked");
      return;
    }

    const seconds = Number(value);
    const imageLimit =
      IMAGE_LIMITS_BY_DURATION[seconds] ?? MAX_IMAGES;

    const lockedByPlan =
      seconds > currentPlanMaxVideoSeconds;

    const lockedByImages =
      imageCount > imageLimit;

    const locked =
      lockedByPlan || lockedByImages;

    radio.disabled = locked;
    option.classList.toggle("locked", locked);
    option.dataset.lockReason =
      lockedByPlan
        ? "plan"
        : lockedByImages
          ? "images"
          : "";
  });

  const checkedDurationRadio =
    document.querySelector(
      'input[name="maxDurationSeconds"]:checked'
    );

  if (checkedDurationRadio?.disabled) {
    const autoDurationRadio =
      document.querySelector(
        'input[name="maxDurationSeconds"][value="auto"]'
      );

    if (autoDurationRadio) {
      autoDurationRadio.checked = true;
    }
  }

  durationOptions.forEach((option) => {
    const radio =
      option.querySelector('input[type="radio"]');

    option.classList.toggle(
      "selected",
      Boolean(radio?.checked)
    );
  });
}

function renderImagePreviews() {
  previewList.replaceChildren();

  selectedImages.forEach((file, index) => {
    const preview = document.createElement("div");
    preview.className = "image-preview";

    const image = document.createElement("img");
    image.alt = uiText(
      "upload.preview_alt",
      `Selected product image ${index + 1}`,
      { number: index + 1 }
    );

    const imageUrl = URL.createObjectURL(file);
    image.src = imageUrl;
    image.addEventListener(
      "load",
      () => URL.revokeObjectURL(imageUrl),
      { once: true }
    );

    const removeButton = document.createElement("button");
    removeButton.className = "remove-image";
    removeButton.type = "button";
    removeButton.setAttribute(
      "aria-label",
      `Remove ${file.name}`
    );
    removeButton.textContent = "×";

    removeButton.addEventListener("click", () => {
      selectedImages.splice(index, 1);
      syncImageInput();
      renderImagePreviews();
      setUploadError();
    });

    preview.append(image, removeButton);
    previewList.append(preview);
  });

  const selectedImageLimit =
    getSelectedImageLimit();

  imageCount.textContent = uiText(
    "upload.count",
    `${selectedImages.length} of ${selectedImageLimit}`,
    {
      count: selectedImages.length,
      max: selectedImageLimit
    }
  );

  if (selectedImages.length > 0) {
    imageCount.style.color = "var(--success)";
  } else {
    imageCount.style.color = "";
  }

  updateDurationAvailability();
}

function addImages(files) {
  setUploadError();

  const incomingFiles = [...files];

  const invalidFile = incomingFiles.find(
    (file) => !ALLOWED_TYPES.has(file.type)
  );

  if (invalidFile) {
    setUploadError(
      uiText("upload.type_error", "Please use only JPG, PNG, or WebP product images.")
    );
    return;
  }

  const existingKeys = new Set(selectedImages.map(fileKey));
  const uniqueFiles = incomingFiles.filter(
    (file) => !existingKeys.has(fileKey(file))
  );

  const selectedDurationSeconds =
    getSelectedDurationSeconds();

  const selectedImageLimit =
    getSelectedImageLimit();

  if (
    selectedImages.length +
      uniqueFiles.length >
    selectedImageLimit
  ) {
    setUploadError(
      selectedDurationSeconds === null
        ? uiText("upload.plan_image_limit", "Your current plan supports up to {max} images with AI Decide.", { max: selectedImageLimit })
        : uiText("upload.duration_image_limit", "{seconds}-second videos support up to {max} images. Remove an image or choose a longer video to add more.", { seconds: selectedDurationSeconds, max: selectedImageLimit })
    );
    return;
  }

  selectedImages.push(...uniqueFiles);
  syncImageInput();
  renderImagePreviews();
}

imageInput.addEventListener("change", () => {
  addImages(imageInput.files);
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragging");
  });
});

uploadZone.addEventListener("drop", (event) => {
  addImages(event.dataTransfer.files);
});

removeLogoButton?.addEventListener("click", () => {
  logoInput.value = "";
  logoName.textContent = "";
  logoPreview.hidden = true;
  logoPreviewImage.removeAttribute("src");
  logoPreviewImage.alt = "";
  setUploadError();
});

removeCtaImageButton?.addEventListener("click", () => {
  ctaImageInput.value = "";
  ctaImageName.textContent = uiText(
    "cta_image.none",
    "No image selected"
  );
  ctaImagePreview.hidden = true;
  ctaImagePreviewImage.removeAttribute("src");
  ctaImagePreviewImage.alt = "";
  setUploadError();
});

logoInput.addEventListener("change", () => {
  const logo = logoInput.files[0];

  if (!logo) {
    logoName.textContent = "";
    logoPreview.hidden = true;
    logoPreviewImage.removeAttribute("src");
    return;
  }

  if (!ALLOWED_TYPES.has(logo.type)) {
    logoInput.value = "";
    logoName.textContent = "";
    logoPreview.hidden = true;
    logoPreviewImage.removeAttribute("src");
    setUploadError(
      uiText(
        "upload.logo_type_error",
        "Please use a JPG, PNG, or WebP logo."
      )
    );
    return;
  }

  setUploadError();
  logoName.textContent = logo.name;

  const logoUrl = URL.createObjectURL(logo);
  logoPreviewImage.src = logoUrl;
  logoPreviewImage.alt = logo.name;
  logoPreview.hidden = false;
  logoPreviewImage.addEventListener(
    "load",
    () => URL.revokeObjectURL(logoUrl),
    { once: true }
  );
});

ctaImageInput?.addEventListener("change", () => {
  const ctaImage = ctaImageInput.files[0];

  if (!ctaImage) {
    ctaImageName.textContent = uiText(
      "cta_image.none",
      "No image selected"
    );
    ctaImagePreview.hidden = true;
    ctaImagePreviewImage.removeAttribute("src");
    return;
  }

  if (!ALLOWED_TYPES.has(ctaImage.type)) {
    ctaImageInput.value = "";
    ctaImageName.textContent = uiText(
      "cta_image.none",
      "No image selected"
    );
    ctaImagePreview.hidden = true;
    ctaImagePreviewImage.removeAttribute("src");
    setUploadError(
      uiText(
        "cta_image.invalid",
        "Please use a JPG, PNG, or WebP call-to-action image."
      )
    );
    return;
  }

  setUploadError();
  ctaImageName.textContent = ctaImage.name;

  const ctaImageUrl = URL.createObjectURL(ctaImage);
  ctaImagePreviewImage.src = ctaImageUrl;
  ctaImagePreviewImage.alt = ctaImage.name;
  ctaImagePreview.hidden = false;
  ctaImagePreviewImage.addEventListener(
    "load",
    () => URL.revokeObjectURL(ctaImageUrl),
    { once: true }
  );
});

description?.addEventListener("input", () => {
  resizeProductDescription();
  characterCount.textContent = `${description.value.length} / 500`;

  if (description.value.trim()) {
    descriptionError.textContent = "";
  }
});

resizeProductDescription();

styleOptions.forEach((option) => {
  const radio = option.querySelector('input[type="radio"]');

  radio.addEventListener("change", () => {
    styleOptions.forEach((item) => {
      item.classList.toggle(
        "selected",
        item.querySelector('input[type="radio"]').checked
      );
    });
  });
});

durationOptions.forEach((option) => {
  const radio =
    option.querySelector('input[type="radio"]');

  radio.addEventListener("change", () => {
    durationOptions.forEach((item) => {
      item.classList.toggle(
        "selected",
        item.querySelector('input[type="radio"]').checked
      );
    });

    renderImagePreviews();

    const selectedDurationSeconds =
      getSelectedDurationSeconds();

    const selectedImageLimit =
      getSelectedImageLimit();

    if (getEffectiveImageCount() > selectedImageLimit) {
      const excessImageCount =
        getEffectiveImageCount() - selectedImageLimit;

      setUploadError(
        selectedDurationSeconds === null
          ? uiText("upload.ai_excess_images", "AI Decide supports up to {max} images on your current plan. Remove {count} {images}.", { max: selectedImageLimit, count: excessImageCount, images: excessImageCount === 1 ? uiText("upload.image_singular", "image") : uiText("upload.image_plural", "images") })
          : uiText("upload.duration_excess_images", "{seconds}-second videos support up to {max} images. Remove {count} {images} or choose a longer video.", { seconds: selectedDurationSeconds, max: selectedImageLimit, count: excessImageCount, images: excessImageCount === 1 ? uiText("upload.image_singular", "image") : uiText("upload.image_plural", "images") })
      );
    } else {
      setUploadError();
    }
  });
});
const CTA_REVIEW_IMAGE_BY_PRESET = {
  "shop-now": "/assets/cta/cta-shop-now.png",
  "learn-more": "/assets/cta/cta-learn-more.png",
  "order-today": "/assets/cta/cta-order-today.png",
  "visit-website": "/assets/cta/cta-visit-website.png",
  "book-now": "/assets/cta/cta-book-now.png",
  custom: "/assets/cta/cta-custom.png"
};

function clearReviewImageUrls() {
  window.quickAdMusic.stop();
  reviewImageUrls.forEach((imageUrl) => {
    if (
      String(imageUrl).startsWith(
        "blob:"
      )
    ) {
      URL.revokeObjectURL(imageUrl);
    }
  });

  reviewImageUrls = [];
  reviewCtaImageUrl = "";
  reviewDefaultCtaImageUrl = "";
  reviewUploadedCtaImageUrl = "";
  reviewCtaImageSource = "default";
  currentReviewImageCount = 0;
}

function selectedNarratorVoice() {
  return (
    narratorOptions.find(
      (option) => option.checked
    )?.value ||
    "automatic"
  );
}

const deletedSceneHistory = [];

const SCENE_TIMELINE_WEIGHTS = {
  3: [7, 10, 8],
  4: [5, 7, 7, 6],
  5: [4, 5, 6, 5, 5],
  6: [4, 4, 5, 4, 4, 4],
  7: [3, 4, 4, 4, 4, 3, 3],
  8: [3, 3, 3, 4, 3, 3, 3, 3],
  9: [3, 3, 3, 3, 3, 3, 3, 3, 3],
  10: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  11: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
};

function countNarrationWords(scenes) {
  return scenes
    .map((scene) =>
      String(scene.narration ?? "").trim()
    )
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function updateSceneTools() {
  const sceneCount =
    currentStoryboard?.scenes?.length ?? 0;

  sceneCountMessage.textContent =
    uiText("review.scene_count", `${sceneCount} scenes in this plan · Minimum 3`, { count: sceneCount, minimum: 3 });

  undoSceneButton.hidden =
    deletedSceneHistory.length === 0;
}

function normalizeSceneTimeline({
  transferCallToAction = false
} = {}) {
  const scenes =
    currentStoryboard.scenes;

  const timelineWeights =
    SCENE_TIMELINE_WEIGHTS[scenes.length];

  if (!timelineWeights) {
    throw new Error(
      "A video plan must contain between 3 and 11 scenes."
    );
  }

  scenes.forEach((scene, index) => {
    scene.sceneNumber =
      index + 1;

    const totalDuration =
      Number(currentStoryboard.totalDurationSeconds) || 30;

    const totalWeight =
      timelineWeights.reduce(
        (sum, weight) => sum + weight,
        0
      );

    const elapsedWeight =
      timelineWeights
        .slice(0, index)
        .reduce(
          (sum, weight) => sum + weight,
          0
        );

    const nextElapsedWeight =
      elapsedWeight +
      timelineWeights[index];

    scene.startSeconds =
      index === 0
        ? 0
        : Math.round(
            totalDuration *
            elapsedWeight /
            totalWeight
          );

    scene.endSeconds =
      index === scenes.length - 1
        ? totalDuration
        : Math.round(
            totalDuration *
            nextElapsedWeight /
            totalWeight
          );

    if (index === 0) {
      scene.role = "hook";
    } else if (index === scenes.length - 1) {
      scene.role = "cta";
    } else if (
      scene.role === "hook" ||
      scene.role === "cta"
    ) {
      scene.role = "benefit";
    }

    scene.approved = false;
  });

  if (transferCallToAction) {
    const finalScene =
      scenes.at(-1);

    const callToAction =
      String(
        currentStoryboard.cta?.text ?? ""
      ).trim();

    if (callToAction) {
      const transferredCaption =
        callToAction.slice(0, 60);

      if (
        Array.isArray(
          finalScene.captionSegments
        )
      ) {
        const transferredEmphasis =
          [transferredCaption];

        finalScene.caption =
          transferredCaption;
        finalScene.narration =
          transferredCaption;
        finalScene.emphasisWords =
          [...transferredEmphasis];
        finalScene.captionSegments = [
          {
            text:
              transferredCaption,
            emphasisWords:
              [...transferredEmphasis]
          }
        ];
      } else {
        finalScene.caption =
          transferredCaption;

        const narration =
          String(
            finalScene.narration ?? ""
          ).trim();

        if (
          !narration
            .toLowerCase()
            .includes(
              callToAction.toLowerCase()
            )
        ) {
          finalScene.narration =
            `${narration} ${callToAction}.`
              .trim();
        }
      }
    }
  }

  currentStoryboard.narrationWordCount =
    countNarrationWords(scenes);
}

function renderCurrentScenePlan() {
  planScenes.replaceChildren();

  currentStoryboard.scenes.forEach(
    (scene) => {

      planScenes.append(
        createSceneReviewCard(scene)
      );
    }
  );

  currentStoryboard.narrationWordCount =
    countNarrationWords(
      currentStoryboard.scenes
    );

  updateSceneTools();
  validateVideoPlan();
}

function deleteScene(scene) {
  if (
    currentStoryboard.scenes.length <= 3
  ) {
    planStatus.textContent =
      "A video needs at least 3 scenes.";

    return;
  }

  deletedSceneHistory.push(
    JSON.parse(
      JSON.stringify(
        currentStoryboard.scenes
      )
    )
  );

  const sceneIndex =
    currentStoryboard.scenes.indexOf(
      scene
    );

  if (sceneIndex < 0) {
    return;
  }

  const deletingCallToAction =
    scene.role === "cta";

  currentStoryboard.scenes.splice(
    sceneIndex,
    1
  );

  normalizeSceneTimeline({
    transferCallToAction:
      deletingCallToAction
  });

  renderCurrentScenePlan();

  planStatus.textContent = uiText("review.scene_deleted", `Scene deleted. Review and confirm the remaining ${currentStoryboard.scenes.length} scenes.`, { count: currentStoryboard.scenes.length });
}

function validateVideoPlan() {
  if (window.quickAdMusic.locked) { finalVideoButton.disabled = true; return false; }
  if (!currentStoryboard) {
    finalVideoButton.disabled = true;
    return false;
  }

  if (websiteConfirmationRequired) {
    finalVideoButton.disabled = true;
    planStatus.textContent =
      uiText(
        "review.branding_confirm_required",
        "Confirm the website or address before creating the final video."
      );

    return false;
  }

  const invalidScene =
    currentStoryboard.scenes.find(
      (scene) => {
        const caption =
          String(scene.caption ?? "").trim();

        return (
          caption.length === 0 ||
          caption.length > 60 ||
          !Number.isInteger(scene.imageIndex) ||
          scene.imageIndex < 1 ||
          scene.imageIndex > currentReviewImageCount
        );
      }
    );

  if (invalidScene) {
    finalVideoButton.disabled = true;
    planStatus.textContent = uiText("review.invalid_scene", `Scene ${invalidScene.sceneNumber} needs a valid picture and a caption containing 1-60 characters.`, { number: invalidScene.sceneNumber });

    return false;
  }

  const approvedCount =
    currentStoryboard.scenes.filter(
      (scene) => scene.approved === true
    ).length;

  const totalScenes =
    currentStoryboard.scenes.length;

  if (approvedCount !== totalScenes) {
    finalVideoButton.disabled = true;
    planStatus.textContent = uiText("review.approval_progress", `${approvedCount} of ${totalScenes} scenes approved. Confirm every scene to create the final video.`, { approved: approvedCount, total: totalScenes });

    return false;
  }

  finalVideoButton.disabled = false;
  planStatus.textContent =
    uiText("review.all_approved", `All ${totalScenes} scenes are approved. You can now create the final video.`, { total: totalScenes });

  return true;
}
function createSceneReviewCard(scene) {
  const card = document.createElement("article");
  card.className = "scene-review-card";

  const sceneHeader = document.createElement("div");
  sceneHeader.className = "scene-review-header";

  const sceneIdentity = document.createElement("div");

  const sceneNumber = document.createElement("span");
  sceneNumber.className = "scene-review-number";
  sceneNumber.textContent =
    String(scene.sceneNumber);

  const sceneHeading = document.createElement("div");

  const sceneTitle = document.createElement("strong");
  sceneTitle.textContent = uiText("scene.title", `Scene ${scene.sceneNumber}`, { number: scene.sceneNumber });

  const sceneTiming = document.createElement("small");
  sceneTiming.textContent = uiText("scene.timing", `${scene.startSeconds}-${scene.endSeconds} seconds - ${scene.role}`, { start: scene.startSeconds, end: scene.endSeconds, role: roleText(scene.role) });

  sceneHeading.append(
    sceneTitle,
    sceneTiming
  );

  sceneIdentity.append(
    sceneNumber,
    sceneHeading
  );

  const approvalBadge =
    document.createElement("span");

  approvalBadge.className =
    "scene-approval-badge";

  approvalBadge.textContent =
    uiText("scene.ai_suggested", "AI suggested");

  const sceneHeaderActions =
    document.createElement("div");

  sceneHeaderActions.className =
    "scene-header-actions";

  const deleteSceneButton =
    document.createElement("button");

  deleteSceneButton.type = "button";
  deleteSceneButton.className =
    "delete-scene-button";

  deleteSceneButton.textContent =
    uiText("scene.delete", "Delete Scene");

  deleteSceneButton.disabled =
    currentStoryboard.scenes.length <= 3;

  deleteSceneButton.title = deleteSceneButton.disabled ? uiText("scene.minimum_title", "A video must retain at least 3 scenes.") : uiText("scene.remove_title", "Remove this scene from the video.");

  deleteSceneButton.addEventListener(
    "click",
    () => {
      deleteScene(scene);
    }
  );

  sceneHeaderActions.append(
    approvalBadge,
    deleteSceneButton
  );

  sceneHeader.append(
    sceneIdentity,
    sceneHeaderActions
  );

  const sceneBody = document.createElement("div");
  sceneBody.className = "scene-review-body";

  const pictureColumn = document.createElement("div");
  pictureColumn.className = "scene-picture-column";

  const pictureFrame = document.createElement("div");
  pictureFrame.className = "scene-picture-frame";

  const picture = document.createElement("img");
  picture.alt = uiText("scene.picture_alt", `Picture assigned to scene ${scene.sceneNumber}`, { number: scene.sceneNumber });

  const isCtaScene =
    scene.role === "cta";

  picture.src =
    isCtaScene
      ? reviewCtaImageUrl
      : reviewImageUrls[scene.imageIndex - 1] ||
        "";

  pictureFrame.append(picture);

  const pictureLabel = document.createElement("label");
  pictureLabel.textContent = uiText("scene.picture", "Picture");

  const pictureSelect =
    document.createElement("select");

  pictureSelect.className =
    "scene-picture-select";

  pictureSelect.setAttribute("aria-label", uiText("scene.picture_for", `Picture for scene ${scene.sceneNumber}`, { number: scene.sceneNumber }));

  reviewImageUrls.forEach(
    (_imageUrl, imageIndex) => {
      const option =
        document.createElement("option");

      option.value =
        String(imageIndex + 1);

      const uploadedFileName =
        selectedImages[
          imageIndex
        ]?.name;

      option.textContent = uploadedFileName ? uiText("scene.picture_named", `Picture ${imageIndex + 1}: ${uploadedFileName}`, { number: imageIndex + 1, name: uploadedFileName }) : uiText("scene.picture_number", `Picture ${imageIndex + 1}`, { number: imageIndex + 1 });

      option.selected =
        imageIndex + 1 ===
        scene.imageIndex;

      pictureSelect.append(option);
    }
  );

  pictureSelect.addEventListener(
    "change",
    () => {
      const imageIndex =
        Number(pictureSelect.value);

      scene.imageIndex =
        imageIndex;

      picture.src =
        reviewImageUrls[imageIndex - 1] ||
        "";

      scene.approved = false;

      updateSceneApprovalState();

      validateVideoPlan();
    }
  );

  pictureLabel.append(pictureSelect);

  pictureColumn.append(pictureFrame);

  if (isCtaScene) {
    const ctaSourceLabel =
      document.createElement("label");

    const ctaSourceTitle =
      document.createElement("span");

    ctaSourceTitle.textContent =
      uiText("scene.cta_picture", "Call-to-action image");

    ctaSourceLabel.append(
      ctaSourceTitle
    );

    if (reviewUploadedCtaImageUrl) {
      const ctaSourceSelect =
        document.createElement("select");

      ctaSourceSelect.className =
        "scene-picture-select";

      const uploadedOption =
        document.createElement("option");

      uploadedOption.value = "uploaded";
      uploadedOption.textContent =
        uiText("scene.cta_uploaded", "Your uploaded picture");

      const defaultOption =
        document.createElement("option");

      defaultOption.value = "default";
      defaultOption.textContent =
        uiText("scene.cta_default", "QuickAd default");

      ctaSourceSelect.append(
        uploadedOption,
        defaultOption
      );

      ctaSourceSelect.value =
        reviewCtaImageSource;

      ctaSourceSelect.addEventListener(
        "change",
        () => {
          reviewCtaImageSource =
            ctaSourceSelect.value === "uploaded"
              ? "uploaded"
              : "default";

          reviewCtaImageUrl =
            reviewCtaImageSource === "uploaded"
              ? reviewUploadedCtaImageUrl
              : reviewDefaultCtaImageUrl;

          picture.src =
            reviewCtaImageUrl;

          scene.approved = false;
          updateSceneApprovalState();
          validateVideoPlan();
        }
      );

      ctaSourceLabel.append(
        ctaSourceSelect
      );
    } else {
      const defaultSource =
        document.createElement("div");

      defaultSource.textContent =
        uiText("scene.cta_default", "QuickAd default");

      ctaSourceLabel.append(
        defaultSource
      );
    }

    const ctaUploadInput =
      document.createElement("input");

    ctaUploadInput.type = "file";
    ctaUploadInput.accept =
      "image/jpeg,image/png,image/webp";
    ctaUploadInput.hidden = true;

    const ctaUploadButton =
      document.createElement("button");

    ctaUploadButton.type = "button";
    ctaUploadButton.className =
      "secondary-button";

    ctaUploadButton.textContent =
      reviewUploadedCtaImageUrl
        ? uiText("scene.cta_replace", "Replace call-to-action image")
        : uiText("scene.cta_upload", "Upload call-to-action image");

    const ctaUploadError =
      document.createElement("div");

    ctaUploadError.className =
      "field-error";

    ctaUploadButton.addEventListener(
      "click",
      () => {
        ctaUploadInput.click();
      }
    );

    ctaUploadInput.addEventListener(
      "change",
      async () => {
        const file =
          ctaUploadInput.files?.[0];

        if (!file) {
          return;
        }

        if (!ALLOWED_TYPES.has(file.type)) {
          ctaUploadError.textContent =
            uiText("scene.cta_invalid", "Please use a JPG, PNG, or WebP call-to-action image.");

          ctaUploadInput.value = "";
          return;
        }

        const formData =
          new FormData();

        formData.append(
          "ctaImage",
          file
        );

        ctaUploadError.textContent = "";
        ctaUploadButton.disabled = true;
        ctaUploadButton.textContent =
          uiText("scene.cta_uploading", "Uploading...");

        try {
          const response =
            await quickAdProjectFetch(
              `/api/projects/${encodeURIComponent(currentProjectId)}/cta-image`,
              {
                method: "POST",
                body: formData
              }
            );

          const result =
            await response.json();

          if (
            !response.ok ||
            !result?.ok ||
            !result?.ctaImageUrl
          ) {
            throw new Error(
              localizedApiError(result) ||
                result?.error ||
                uiText("scene.cta_upload_failed", "The call-to-action image could not be uploaded.")
            );
          }

          reviewUploadedCtaImageUrl =
            result.ctaImageUrl;

          reviewCtaImageSource =
            "uploaded";

          reviewCtaImageUrl =
            reviewUploadedCtaImageUrl;

          scene.approved = false;

          renderCurrentScenePlan();
          updateSceneApprovalState();
          validateVideoPlan();
        } catch (error) {
          ctaUploadError.textContent =
            error?.message ||
            uiText("scene.cta_upload_failed", "The call-to-action image could not be uploaded.");

          ctaUploadButton.disabled = false;
          ctaUploadButton.textContent =
            reviewUploadedCtaImageUrl
              ? uiText("scene.cta_replace", "Replace call-to-action image")
              : uiText("scene.cta_upload", "Upload call-to-action image");
        }
      }
    );

    pictureColumn.append(
      ctaSourceLabel,
      ctaUploadInput,
      ctaUploadButton,
      ctaUploadError
    );
  } else if (!isCtaScene) {
    pictureColumn.append(pictureLabel);
  }

  const captionColumn = document.createElement("div");
  captionColumn.className = "scene-caption-column";

  const captionLabel = document.createElement("label");
  captionLabel.textContent = uiText("scene.ai_caption", "AI caption");

  const captionInput =
    document.createElement("textarea");

  captionInput.className =
    "scene-caption-input";

  captionInput.rows = 2;
  captionInput.maxLength = 60;
  captionInput.value =
    scene.caption;

  captionInput.setAttribute("aria-label", uiText("scene.caption_for", `Caption for scene ${scene.sceneNumber}`, { number: scene.sceneNumber }));

  const captionMeta = document.createElement("div");
  captionMeta.className = "scene-caption-meta";

  const captionAdvice =
    document.createElement("span");

  captionAdvice.textContent = uiText("scene.caption_advice", "Recommended: 3–8 words · Maximum: 60 characters");

  const captionCounter =
    document.createElement("span");

  captionCounter.textContent = uiText("scene.caption_count", `${captionInput.value.length} / 60 characters`, { count: captionInput.value.length, max: 60 });

  captionInput.addEventListener(
    "input",
    () => {
      scene.caption =
        captionInput.value;
      scene.narration =
        captionInput.value;

      if (
        Array.isArray(scene.captionSegments)
      ) {
        const editedCaption =
          captionInput.value;

        const previousEmphasis =
          Array.isArray(scene.emphasisWords)
            ? scene.emphasisWords
            : [];

        const preservedEmphasis =
          previousEmphasis.filter(
            (term) =>
              editedCaption.includes(term)
          );

      if (preservedEmphasis.length > 0) {
        scene.emphasisWords =
          preservedEmphasis;

        scene.captionSegments = [
          {
            text:
              editedCaption,
            emphasisWords:
              [...preservedEmphasis]
          }
        ];
      } else {
        scene.emphasisWords = [];
        delete scene.captionSegments;
      }
      }


      narrationText.textContent =
        scene.narration;

      currentStoryboard.narrationWordCount =
        countNarrationWords(
          currentStoryboard.scenes
        );

      captionCounter.textContent = uiText("scene.caption_count", `${captionInput.value.length} / 60 characters`, { count: captionInput.value.length, max: 60 });

      captionCounter.classList.toggle(
        "limit-warning",
        captionInput.value.length > 55
      );

      scene.approved = false;

      updateSceneApprovalState();

      validateVideoPlan();
    }
  );

  captionMeta.append(
    captionAdvice,
    captionCounter
  );

  const narrationLabel =
    document.createElement("span");

  narrationLabel.className =
    "scene-narration-label";

  narrationLabel.textContent =
    uiText("scene.narration_preview", "Narration preview");

  const narrationText =
    document.createElement("p");

  narrationText.className =
    "scene-narration-text";

  narrationText.textContent =
    scene.narration;

  captionLabel.append(
    captionInput,
    captionMeta
  );

  captionColumn.append(
    captionLabel,
    narrationLabel,
    narrationText
  );

  sceneBody.append(
    pictureColumn,
    captionColumn
  );

  const sceneApprovalActions =
    document.createElement("div");

  sceneApprovalActions.className =
    "scene-approval-actions";

  const confirmSceneButton =
    document.createElement("button");

  confirmSceneButton.type = "button";
  confirmSceneButton.className =
    "confirm-scene-button";

  function updateSceneApprovalState() {
    if (scene.approved === true) {
      approvalBadge.textContent =
        uiText("scene.approved", "Scene approved");

      approvalBadge.classList.add(
        "approved"
      );

      confirmSceneButton.textContent =
        `✓ ${uiText("scene.approved", "Scene approved")}`;

      confirmSceneButton.classList.add(
        "approved"
      );
    } else {
      approvalBadge.textContent =
        uiText("scene.needs_approval", "Needs approval");

      approvalBadge.classList.remove(
        "approved"
      );

      confirmSceneButton.textContent =
        uiText("scene.confirm", "Confirm Scene");

      confirmSceneButton.classList.remove(
        "approved"
      );
    }
  }

  confirmSceneButton.addEventListener(
    "click",
    () => {
      const caption =
        String(scene.caption ?? "").trim();
      const validScene =
        caption.length > 0 &&
        caption.length <= 60 &&
        Number.isInteger(scene.imageIndex) &&
        scene.imageIndex >= 1 &&
        scene.imageIndex <= currentReviewImageCount;

      if (!validScene) {
        scene.approved = false;

        updateSceneApprovalState();
        validateVideoPlan();

        return;
      }

      scene.caption = caption;
      captionInput.value = caption;
      narrationText.textContent =
        scene.narration;

      currentStoryboard.narrationWordCount =
        countNarrationWords(
          currentStoryboard.scenes
        );

      scene.approved = true;

      updateSceneApprovalState();
      validateVideoPlan();
    }
  );

  sceneApprovalActions.append(
    confirmSceneButton
  );

  captionColumn.append(
    sceneApprovalActions
  );

  updateSceneApprovalState();

  card.append(
    sceneHeader,
    sceneBody
  );

  return card;
}

function renderDurationReviewSummary(project, storyboard) {
  if (!durationReviewSummary) {
    return;
  }

  const durationTierSeconds =
    Number(
      project?.output?.maxDurationSeconds
    ) || 30;

  const creditCost =
    durationTierSeconds === 60
      ? 20
      : durationTierSeconds === 45
        ? 15
        : 10;

  const actualDurationSeconds =
    Number(
      storyboard?.totalDurationSeconds
    ) || durationTierSeconds;

  const aiSelected =
    project?.output?.durationMode === "auto";

  const costLabel =
    currentPlanId === "free"
      ? uiText("duration.free_video", "Free video")
      : uiText("duration.credit_cost", "{count} credits", { count: creditCost });

  durationReviewSummary.textContent =
    aiSelected
      ? uiText("duration.ai_selected_summary", "✨ AI selected: Up to {max} seconds · {cost} · Actual plan: {actual} seconds", { max: durationTierSeconds, cost: costLabel, actual: actualDurationSeconds })
      : uiText("duration.selected_summary", "Selected: Up to {max} seconds · {cost} · Actual plan: {actual} seconds", { max: durationTierSeconds, cost: costLabel, actual: actualDurationSeconds });
}

function moveDurationToSetup() {
  if (durationFieldset && durationSetupHome) {
    durationSetupHome.append(durationFieldset);
  }
}

function moveDurationToPlanReview() {
  if (durationFieldset && planDurationHost) {
    planDurationHost.append(durationFieldset);
    updateDurationAvailability();
  }
}

function moveStyleToSetup() {
  const setupFinalPanel =
    styleSetupHome?.querySelector(".setup-final-panel");

  if (styleSection && styleSetupHome && setupFinalPanel) {
    styleSetupHome.insertBefore(
      styleSection,
      setupFinalPanel
    );
  }
}

function moveStyleToPlanReview() {
  if (styleSection && planStyleHost) {
    planStyleHost.append(styleSection);
  }
}

function moveAudioToSetup() {
  if (setupAudioHost && narratorSection && musicSection) {
    setupAudioHost.append(narratorSection);
    setupAudioHost.append(musicSection);
  }
}

function moveAudioToPlanReview() {
  if (regeneratePlanButton && narratorSection && musicSection) {
    regeneratePlanButton.after(narratorSection, musicSection);
  }
}

moveAudioToSetup();

function showPlanReviewMode() {
  moveDurationToPlanReview();
  moveStyleToPlanReview();
  moveAudioToPlanReview();
  form.hidden = true;
  planReview.hidden = false;

  planReview.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function showProjectSetupMode() {
  moveDurationToSetup();
  moveStyleToSetup();
  moveAudioToSetup();
  planReview.hidden = true;
  form.hidden = false;

  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderPlanBrandingReview(project) {
  if (!planBrandingReview || !planBrandingContent) {
    return;
  }

  planBrandingContent.replaceChildren();

  const projectId =
    String(project?.id ?? "");

  const logoAsset =
    project?.assets?.productLogo;

  const website =
    String(project?.website ?? "").trim();

  const markPlanChanged = () => {
    currentStoryboard?.scenes?.forEach((scene) => {
      scene.approved = false;
    });

    renderCurrentScenePlan();
  };

  const requestJson = async (url, options) => {
    const response =
      await fetch(url, options);

    const payload =
      await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.error ||
        uiText(
          "review.branding_update_failed",
          "Could not update video branding."
        )
      );
    }

    return payload;
  };

  // --------------------------------------------------------
  // Product logo
  // --------------------------------------------------------

  const logoItem =
    document.createElement("div");

  logoItem.className =
    "plan-branding-item plan-branding-logo-item";

  const logoMain =
    document.createElement("div");

  logoMain.className =
    "plan-branding-main";

  if (logoAsset?.storedName && projectId) {
    const logoImage =
      document.createElement("img");

    logoImage.className =
      "plan-branding-logo";

    logoImage.src =
      `/api/projects/${encodeURIComponent(
        projectId
      )}/assets/${encodeURIComponent(
        logoAsset.storedName
      )}`;

    logoImage.alt =
      uiText(
        "review.branding_logo_alt",
        "Uploaded product logo"
      );

    logoMain.append(logoImage);
  }

  const logoText =
    document.createElement("div");

  const logoLabel =
    document.createElement("small");

  logoLabel.textContent =
    uiText(
      "review.branding_logo",
      "Product logo"
    );

  const logoValue =
    document.createElement("strong");

  logoValue.textContent =
    logoAsset?.originalName ||
    uiText(
      "review.branding_logo_none",
      "No product logo"
    );

  logoText.append(
    logoLabel,
    logoValue
  );

  logoMain.append(logoText);

  const logoActions =
    document.createElement("div");

  logoActions.className =
    "plan-branding-actions";

  const replaceLogoButton =
    document.createElement("button");

  replaceLogoButton.type = "button";
  replaceLogoButton.className =
    "plan-branding-button";

  replaceLogoButton.textContent =
    uiText(
      "review.branding_logo_replace",
      logoAsset?.storedName
        ? "Replace"
        : "Add logo"
    );

  const reviewLogoInput =
    document.createElement("input");

  reviewLogoInput.type = "file";
  reviewLogoInput.accept =
    "image/jpeg,image/png,image/webp";
  reviewLogoInput.hidden = true;

  replaceLogoButton.addEventListener(
    "click",
    () => {
      reviewLogoInput.click();
    }
  );

  reviewLogoInput.addEventListener(
    "change",
    async () => {
      const file =
        reviewLogoInput.files?.[0];

      if (!file || !projectId) {
        return;
      }

      replaceLogoButton.disabled = true;

      try {
        const formData =
          new FormData();

        formData.append(
          "productLogo",
          file
        );

        const payload =
          await requestJson(
            `/api/projects/${encodeURIComponent(
              projectId
            )}/product-logo`,
            {
              method: "POST",
              body: formData
            }
          );

        project.assets ??= {};

        project.assets.productLogo =
          payload.productLogo;

        markPlanChanged();
        renderPlanBrandingReview(project);
      } catch (error) {
        window.alert(
          error?.message ||
          uiText(
            "review.branding_update_failed",
            "Could not update video branding."
          )
        );
      } finally {
        reviewLogoInput.value = "";
        replaceLogoButton.disabled = false;
      }
    }
  );

  logoActions.append(
    replaceLogoButton,
    reviewLogoInput
  );

  if (logoAsset?.storedName) {
    const removeLogoButton =
      document.createElement("button");

    removeLogoButton.type = "button";

    removeLogoButton.className =
      "plan-branding-button plan-branding-remove";

    removeLogoButton.textContent =
      uiText(
        "review.branding_remove",
        "Remove"
      );

    removeLogoButton.addEventListener(
      "click",
      async () => {
        if (!projectId) {
          return;
        }

        removeLogoButton.disabled = true;
        replaceLogoButton.disabled = true;

        try {
          await requestJson(
            `/api/projects/${encodeURIComponent(
              projectId
            )}/product-logo`,
            {
              method: "DELETE"
            }
          );

          project.assets ??= {};
          delete project.assets.productLogo;

          markPlanChanged();
          renderPlanBrandingReview(project);
        } catch (error) {
          window.alert(
            error?.message ||
            uiText(
              "review.branding_update_failed",
              "Could not update video branding."
            )
          );

          removeLogoButton.disabled = false;
          replaceLogoButton.disabled = false;
        }
      }
    );

    logoActions.append(
      removeLogoButton
    );
  }

  logoItem.append(
    logoMain,
    logoActions
  );

  planBrandingContent.append(
    logoItem
  );

  // --------------------------------------------------------
  // Website
  // --------------------------------------------------------

  const websiteItem =
    document.createElement("div");

  websiteItem.className =
    "plan-branding-item plan-branding-website-item";

  const websiteMain =
    document.createElement("div");

  websiteMain.className =
    "plan-branding-main plan-branding-website-main";

  const websiteLabel =
    document.createElement("label");

  websiteLabel.className =
    "plan-branding-website-label";

  const websiteLabelText =
    document.createElement("span");

  websiteLabelText.textContent =
    uiText(
      "review.branding_website",
      "Website or address"
    );

  const websiteInput =
    document.createElement("textarea");

  websiteInput.maxLength = 60;
  websiteInput.rows = 1;

  websiteInput.className =
    "plan-branding-website-input";

  websiteInput.value = website;

  websiteInput.placeholder =
    uiText(
      "review.branding_website_placeholder",
      "Website, store address, social page, or other contact information"
    );

  websiteInput.autocomplete = "off";

  websiteLabel.append(
    websiteLabelText,
    websiteInput
  );

  const websiteCounter =
    document.createElement("div");

  websiteCounter.className =
    "text-meta";

  const websiteCounterSpacer =
    document.createElement("span");

  const websiteCounterValue =
    document.createElement("span");

  const resizeWebsiteInput = () => {
    websiteInput.style.height = "auto";
    websiteInput.style.height =
      `${websiteInput.scrollHeight}px`;
  };

  const updateWebsiteCounter = () => {
    websiteCounterValue.textContent =
      uiText(
        "scene.caption_count",
        `${websiteInput.value.length} / 60 characters`,
        {
          count: websiteInput.value.length,
          max: 60
        }
      );
  };

  updateWebsiteCounter();
  resizeWebsiteInput();

  websiteCounter.append(
    websiteCounterSpacer,
    websiteCounterValue
  );

  websiteMain.append(
    websiteLabel,
    websiteCounter
  );

  const websiteActions =
    document.createElement("div");

  websiteActions.className =
    "plan-branding-actions";

  const saveWebsiteButton =
    document.createElement("button");

  saveWebsiteButton.type = "button";

  saveWebsiteButton.className =
    "plan-branding-button confirm-scene-button";

  saveWebsiteButton.textContent =
    uiText(
      "review.branding_save",
      "Confirm"
    );

  const removeWebsiteButton =
    document.createElement("button");

  removeWebsiteButton.type = "button";

  removeWebsiteButton.className =
    "plan-branding-button plan-branding-remove";

  removeWebsiteButton.textContent =
    uiText(
      "review.branding_remove",
      "Remove"
    );

  removeWebsiteButton.hidden =
    !website;

  const websiteSavedStatus =
    document.createElement("span");

  websiteSavedStatus.className =
    "plan-branding-saved-status";

  websiteSavedStatus.textContent =
    uiText(
      "review.branding_saved",
      "✓ Confirmed"
    );

  websiteSavedStatus.hidden = true;

  websiteConfirmationRequired =
    String(websiteInput.value ?? "").trim().length > 0;

  saveWebsiteButton.hidden =
    !websiteConfirmationRequired;

  const showWebsiteEditingState = () => {
    saveWebsiteButton.disabled = false;
    removeWebsiteButton.disabled = false;
    websiteInput.disabled = false;
    saveWebsiteButton.hidden =
      !String(websiteInput.value ?? "").trim();
    removeWebsiteButton.hidden = !project.website;
    websiteSavedStatus.hidden = true;
  };

  const showWebsiteSavedState = () => {
    saveWebsiteButton.hidden = true;
    removeWebsiteButton.hidden = true;
    websiteSavedStatus.hidden = false;
  };

  const saveWebsite = async (
    nextWebsite
  ) => {
    if (!projectId) {
      return;
    }

    saveWebsiteButton.disabled = true;
    removeWebsiteButton.disabled = true;
    websiteInput.disabled = true;

    try {
      const payload =
        await requestJson(
          `/api/projects/${encodeURIComponent(
            projectId
          )}/website`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              website: nextWebsite
            })
          }
        );

      project.website =
        payload.website || "";

      websiteConfirmationRequired = false;

      websiteInput.value =
        project.website;
      updateWebsiteCounter();
      resizeWebsiteInput();

      if (project.website) {
        showWebsiteSavedState();
      } else {
        saveWebsiteButton.hidden =
          !String(websiteInput.value ?? "").trim();
        removeWebsiteButton.hidden = true;
        websiteSavedStatus.hidden = true;
      }

      websiteInput.disabled = false;
      validateVideoPlan();
    } catch (error) {
      window.alert(
        error?.message ||
        uiText(
          "review.branding_update_failed",
          "Could not update video branding."
        )
      );

      saveWebsiteButton.disabled = false;
      removeWebsiteButton.disabled = false;
      websiteInput.disabled = false;
      websiteInput.focus();
    }
  };

  saveWebsiteButton.addEventListener(
    "click",
    () => {
      saveWebsite(
        websiteInput.value
      );
    }
  );

  websiteInput.addEventListener(
    "input",
    () => {
      updateWebsiteCounter();
      resizeWebsiteInput();

      websiteConfirmationRequired =
        Boolean(
          String(
            websiteInput.value ?? ""
          ).trim()
        );

      showWebsiteEditingState();
      validateVideoPlan();
    }
  );

  websiteInput.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      saveWebsite(
        websiteInput.value
      );
    }
  );

  removeWebsiteButton.addEventListener(
    "click",
    () => {
      websiteConfirmationRequired = true;
      validateVideoPlan();
      saveWebsite("");
    }
  );

  websiteActions.append(
    saveWebsiteButton,
    removeWebsiteButton,
    websiteSavedStatus
  );

  websiteItem.append(
    websiteMain,
    websiteActions
  );

  planBrandingContent.append(
    websiteItem
  );

  planBrandingReview.hidden = false;
}
function renderVideoPlanReview(
  project,
  storyboard,
  savedImageUrls = null
) {
  const currentMusicChoice =
    window.quickAdMusic.value;
  const currentMusicVolume =
    window.quickAdMusic.volume;

  clearReviewImageUrls();

  const savedMusicChoice =
    project.storyboard?.musicChoice;
  const savedMusicVolume =
    project.storyboard?.musicVolume;

  window.quickAdMusic.restore(
    savedMusicChoice ?? currentMusicChoice,
    project.status === "video_ready",
    savedMusicVolume ?? currentMusicVolume
  );

  reviewImageUrls =
    Array.isArray(savedImageUrls)
      ? [...savedImageUrls]
      : selectedImages.map(
          (file) =>
            URL.createObjectURL(file)
        );

  currentReviewImageCount =
    reviewImageUrls.length;

  const uploadedCtaAsset =
    project?.assets?.ctaImage;

  const ctaPreset =
    String(
      project?.ctaPreset ||
        "shop-now"
    );

  reviewDefaultCtaImageUrl =
    CTA_REVIEW_IMAGE_BY_PRESET[
      ctaPreset
    ] ||
    CTA_REVIEW_IMAGE_BY_PRESET[
      "shop-now"
    ];

  reviewUploadedCtaImageUrl = "";

  if (
    project?.id &&
    uploadedCtaAsset?.storedName
  ) {
    reviewUploadedCtaImageUrl =
      `/api/projects/${encodeURIComponent(
        project.id
      )}/assets/${encodeURIComponent(
        uploadedCtaAsset.storedName
      )}`;
  }

  reviewCtaImageSource =
    reviewUploadedCtaImageUrl
      ? "uploaded"
      : "default";

  reviewCtaImageUrl =
    reviewCtaImageSource === "uploaded"
      ? reviewUploadedCtaImageUrl
      : reviewDefaultCtaImageUrl;

  currentProjectId =
    project.id;

  currentStoryboard =
    JSON.parse(
      JSON.stringify(storyboard)
    );

  renderDurationReviewSummary(
    project,
    currentStoryboard
  );

  renderPlanBrandingReview(project);

  currentStoryboard.scenes.forEach(
    (scene) => {
      scene.approved = false;
    }
  );

  deletedSceneHistory.length = 0;

  planReview.hidden = false;
  renderCurrentScenePlan();
}

undoSceneButton.addEventListener(
  "click",
  () => {
    const previousScenes =
      deletedSceneHistory.pop();

    if (!previousScenes) {
      return;
    }

    currentStoryboard.scenes =
      previousScenes;

    currentStoryboard.scenes.forEach(
      (scene) => {
        scene.approved = false;
      }
    );

    currentStoryboard.narrationWordCount =
      countNarrationWords(
        currentStoryboard.scenes
      );

    renderCurrentScenePlan();

    planStatus.textContent = uiText("review.scene_restored", `Deleted scene restored. Review and confirm all ${currentStoryboard.scenes.length} scenes.`, { count: currentStoryboard.scenes.length });
  }
);

narratorOptions.forEach((option) => {
  option.addEventListener(
    "change",
    () => {
      planStatus.textContent =
        `Narrator selected: ${selectedNarratorVoice().replaceAll("-", " ")}.`;

      validateVideoPlan();
    }
  );
});

finalVideoButton.addEventListener(
  "click",
  async () => {
    if (!validateVideoPlan()) {
      planStatus.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      return;
    }

    window.quickAdMusic.lock("busy");
    const originalButtonText =
      finalVideoButton.textContent;

    finalVideoButton.disabled = true;
    finalVideoButton.textContent =
      uiText("review.final_btn_creating", "Creating Final Video...");

    planStatus.classList.remove(
      "approved"
    );

    planStatus.textContent =
      uiText("result.generating_desc", "Generating your selected AI narration and rendering the final MP4. This may take about one minute.");

    try {
      const finalStoryboard = {
        ...currentStoryboard,
        scenes:
          currentStoryboard.scenes.map(
            (scene) => {
              const {
                approved: _approved,
                ...validatedScene
              } = scene;

              return validatedScene;
            }
          )
      };

      const response = await quickAdProjectFetch(
        `/api/projects/${currentProjectId}/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            storyboard:
              finalStoryboard,
            musicChoice: window.quickAdMusic.value,
            musicVolume: window.quickAdMusic.volume,
            narratorChoice:
              selectedNarratorVoice(),
            ctaImageSource:
              reviewCtaImageSource
          })
        }
      );

      const result =
        await response.json();

      if (!response.ok || !result.ok) {
        if (
          result?.code ===
          "VIDEO_RECOVERY_LIMIT_REACHED"
        ) {
          const limit =
            Number(result?.recovery?.limit) ||
            10;

          showVideoRecoveryLimitDialog(limit);
          return;
        }

        throw new Error(
          localizedApiError(result) ||
          uiText(
            "api.final_video_generation_failed",
            "The final video could not be created. Please try again."
          )
        );
      }

      window.quickAdMusic.lock("ready");

      planBrandingContent
        ?.querySelectorAll(
          ".plan-branding-button"
        )
        .forEach((button) => {
          button.hidden = true;
        });

      planBrandingContent
        ?.querySelectorAll(
          ".plan-branding-website-input"
        )
        .forEach((input) => {
          input.disabled = true;
        });
      finalVideoButton.textContent =
        uiText("result.video_ready", "Video Ready");


      planStatus.classList.add(
        "approved",
        "video-result-card"
      );

      playQuickAdSound("video-ready");

      const resultHeading =
        document.createElement("strong");

      resultHeading.className =
        "video-result-heading";

      resultHeading.textContent =
        uiText("result.final_ready", "Your final video is ready");

      const resultSummary =
        document.createElement("span");

      resultSummary.className =
        "video-result-summary";

      const renderedDurationSeconds =
        Math.round(
          Number(
            result.video?.durationSeconds
          ) ||
          Number(
            currentStoryboard.totalDurationSeconds
          ) ||
          30
        );

      resultSummary.textContent =
        uiText("result.summary_complete", `${currentStoryboard.scenes.length} scenes · ${renderedDurationSeconds}-second MP4 · AI narration complete`, { count: currentStoryboard.scenes.length, seconds: renderedDurationSeconds });

      const resultActions =
        document.createElement("span");

      resultActions.className =
        "video-result-actions";

      const watchLink =
        document.createElement("a");

      watchLink.href =
        result.videoUrl;

      watchLink.target = "_blank";
      watchLink.rel = "noopener";
      watchLink.className =
        "video-result-link primary";

      watchLink.textContent =
        uiText("result.watch", "Watch Video");

      const downloadLink =
        document.createElement("a");

      downloadLink.href =
        result.videoUrl + "?download=1";

      downloadLink.download =
        "quickad-video.mp4";

      downloadLink.className =
        "video-result-link";

      downloadLink.textContent =
        uiText("result.download", "Download MP4");

      resultActions.append(
        watchLink,
        downloadLink
      );

      planStatus.replaceChildren(
        resultHeading,
        resultSummary,
        resultActions
      );

      const successMark =
        document.createElement("span");

      successMark.className =
        "success-mark";

      successMark.setAttribute(
        "aria-hidden",
        "true"
      );

      successMark.textContent = "✓";

      const successContent =
        document.createElement("div");

      const successTitle =
        document.createElement("strong");

      successTitle.textContent =
        uiText("result.final_ready", "Your final video is ready");

      const successDetails =
        document.createElement("span");

      successDetails.textContent =
        uiText("result.summary_saved", `${currentStoryboard.scenes.length} scenes · AI narration · ${renderedDurationSeconds}-second MP4`, { count: currentStoryboard.scenes.length, seconds: renderedDurationSeconds });

      successContent.append(
        successTitle,
        successDetails
      );

      formMessage.replaceChildren(
        successMark,
        successContent
      );

      formMessage.classList.remove(
        "error"
      );

      const planApproval =
        planStatus.closest(".plan-approval");

      if (planApproval) {
        planApproval.before(formMessage);
      }

      formMessage.classList.add(
        "visible",
        "success-card"
      );

      formMessage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });

    } catch (error) {
      window.quickAdMusic.lock("");
      finalVideoButton.disabled = false;
      finalVideoButton.textContent =
        originalButtonText;

      planStatus.classList.remove(
        "approved"
      );

      planStatus.textContent =
        String(error?.message || "").trim() ||
        uiText(
          "api.final_video_generation_failed",
          "The final video could not be created. Please try again."
        );
    }

    planStatus.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
);
function updateCustomCtaField() {
  const customSelected =
    callToActionSelect.value ===
    "custom";

  customCtaField.hidden =
    !customSelected;

  customCtaInput.required =
    customSelected;

  customCtaError.textContent = "";

  if (customSelected) {
    customCtaInput.focus();
  }
}

callToActionSelect.addEventListener(
  "change",
  updateCustomCtaField
);

customCtaInput.addEventListener(
  "input",
  () => {
    customCtaCount.textContent =
      uiText("cta.count", `${customCtaInput.value.length} / 40 characters`, { count: customCtaInput.value.length, max: 40 });

    customCtaError.textContent = "";
  }
);

updateCustomCtaField();




regeneratePlanButton.addEventListener("click", () => {
  form.requestSubmit();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  setUploadError();
  descriptionError.textContent = "";
  form.insertAdjacentElement(
    "afterend",
    formMessage
  );

  formMessage.classList.remove(
    "visible",
    "error",
    "success-card",
    "success-popover"
  );
  formMessage.textContent = "";

  let firstInvalidElement = null;

  if (getEffectiveImageCount() === 0) {
    setUploadError(uiText("upload.required_error", "Please add at least one product image."));
    firstInvalidElement = uploadZone;
  }

  const selectedDurationSeconds =
    getSelectedDurationSeconds();

  const selectedImageLimit =
    getSelectedImageLimit();

  if (
    getEffectiveImageCount() >
    selectedImageLimit
  ) {
    const excessImageCount =
      getEffectiveImageCount() -
      selectedImageLimit;

    setUploadError(
      selectedDurationSeconds === null
        ? uiText("upload.ai_excess_images", "AI Decide supports up to {max} images on your current plan. Remove {count} {images}.", { max: selectedImageLimit, count: excessImageCount, images: excessImageCount === 1 ? uiText("upload.image_singular", "image") : uiText("upload.image_plural", "images") })
        : uiText("upload.duration_excess_images", "{seconds}-second videos support up to {max} images. Remove {count} {images} or choose a longer video.", { seconds: selectedDurationSeconds, max: selectedImageLimit, count: excessImageCount, images: excessImageCount === 1 ? uiText("upload.image_singular", "image") : uiText("upload.image_plural", "images") })
    );

    firstInvalidElement =
      uploadZone;
  }


  if (firstInvalidElement) {
    firstInvalidElement.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    if (typeof firstInvalidElement.focus === "function") {
      firstInvalidElement.focus({
        preventScroll: true
      });
    }

    return;
  }

  const originalButtonContent =
    createButton.innerHTML;

  const originalRegenerateButtonContent =
    regeneratePlanButton.innerHTML;

  createButton.disabled = true;
  createButton.innerHTML =
    `<span>${uiText(
      "status.creating_plan",
      "Creating your video plan..."
    )}</span><span>•••</span>`;

  regeneratePlanButton.disabled = true;
  regeneratePlanButton.innerHTML =
    createButton.innerHTML;

  try {
    const projectData = new FormData(form);

    // Submit the original File objects directly instead of
    // depending on a reconstructed FileList on mobile browsers.
    projectData.delete("productImages");

    selectedImages.forEach((file) => {
      projectData.append("productImages", file, file.name);
    });

    projectData.set(
      "maxDurationSeconds",
      String(getSelectedDurationChoice())
    );
    projectData.set(
      "description",
      description.value.trim()
    );

    // Auto-detect UI language for video generation - Phase 2 Mexico
    const userLang = localStorage.getItem('quickad_lang') || document.documentElement.lang || navigator.language || 'en';
    const normalizedLang = userLang.toLowerCase();
    const targetLang = normalizedLang.startsWith("es")
      ? "es-419"
      : normalizedLang.startsWith("pt")
        ? "pt-BR"
        : normalizedLang.startsWith("fr")
          ? "fr"
          : normalizedLang.startsWith("de")
            ? "de"
            : normalizedLang.startsWith("it")
              ? "it"
              : normalizedLang.startsWith("ja")
                ? "ja"
                : normalizedLang.startsWith("ko")
                  ? "ko"
                  : normalizedLang === "zh-tw" ||
                    normalizedLang === "zh-hant" ||
                    normalizedLang.startsWith("zh-hant-") ||
                    normalizedLang === "zh-hk" ||
                    normalizedLang === "zh-mo"
                    ? "zh-TW"
                  : normalizedLang.startsWith("zh")
                    ? "zh"
                    : normalizedLang.startsWith("tr")
                      ? "tr"
                      : normalizedLang.startsWith("hi")
                        ? "hi"
                        : "en";
    projectData.set('language', targetLang);
    projectData.set('targetLanguage', targetLang);

    const ctaPresetByValue = {
      "Shop Now": "shop-now",
      "Learn More": "learn-more",
      "Order Today": "order-today",
      "Visit Our Website": "visit-website",
      "Book Now": "book-now"
    };

    const selectedCtaPreset =
      callToActionSelect.value === "custom"
        ? "custom"
        : ctaPresetByValue[
            callToActionSelect.value
          ] ?? "shop-now";

    projectData.set(
      "ctaPreset",
      selectedCtaPreset
    );

    if (
      callToActionSelect.value ===
      "custom"
    ) {
      const customCallToAction =
        customCtaInput.value.trim();

      if (!customCallToAction) {
        customCtaError.textContent = uiText("cta.custom_required", "Enter your call to action.");

        customCtaInput.focus();

        throw new Error(uiText("cta.custom_required_error", "Please enter your custom call to action."));
      }
      projectData.set(
        "callToAction",
        customCallToAction
      );
    } else {
      projectData.set(
        "callToAction",
        getLocalizedCallToAction()
      );
    }

    const response = await quickAdProjectFetch(
      "/api/projects",
      {
        method: "POST",
        body: projectData
      }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      const apiError =
        new Error(
          localizedApiError(result) ||
          uiText(
            "api.project_input_invalid",
            "Please check your project details and try again."
          )
        );

      apiError.code =
        String(result?.code || "");

      throw apiError;
    }

    const shortProjectId =
      result.project.id.slice(0, 8);

    const sceneCount =
      result.storyboard.scenes.length;

    const newProjectImageUrls =
      Array.isArray(
        result.project?.assets
          ?.productImages
      )
        ? result.project.assets
            .productImages
            .map((asset) => {
              const storedName =
                String(
                  asset?.storedName ?? ""
                );

              if (!storedName) {
                return "";
              }

              return (
                `/api/projects/${result.project.id}` +
                `/assets/${encodeURIComponent(storedName)}`
              );
            })
            .filter(Boolean)
        : [];


    renderVideoPlanReview(
      result.project,
      result.storyboard,
      newProjectImageUrls
    );
    showPlanReviewMode();

    const successMark =
      document.createElement("span");

    successMark.className =
      "success-mark";

    successMark.textContent =
      "✓";

    successMark.setAttribute(
      "aria-hidden",
      "true"
    );

    const successContent =
      document.createElement("span");

    successContent.className =
      "success-content";

    const successTitle =
      document.createElement("strong");

    successTitle.className =
      "success-title";

    successTitle.textContent =
      uiText("review.plan_ready_title", "Your AI video plan is ready");

    const successDetails =
      document.createElement("span");

    successDetails.className =
      "success-details";

    successDetails.textContent =
      uiText("result.project_prefix", `Project ${shortProjectId} • `, { id: shortProjectId }) +
      `"${result.storyboard.title}" • ` +
      uiText("result.scenes_prefix", `${sceneCount} scenes • `, { count: sceneCount }) +
      uiText("video.duration_seconds", `${result.storyboard.totalDurationSeconds} seconds`, { seconds: result.storyboard.totalDurationSeconds });
    const successNext =
      document.createElement("span");

    successNext.className =
      "success-next";

    successNext.textContent =
      uiText("review.generated_desc", "Review the assigned pictures and AI captions before creating narration and video.");

    successContent.append(
      successTitle,
      successDetails,
      successNext
    );

    formMessage.replaceChildren(
      successMark,
      successContent
    );

    playQuickAdSound("plan-ready");
    formMessage.classList.remove("error");
    formMessage.classList.add(
      "visible",
      "success-card",
      "success-popover"
    );
    window.setTimeout(() => {
      formMessage.classList.remove(
        "success-popover"
      );

      planReview.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 3000);
  } catch (error) {
    formMessage.textContent = String(error?.message || uiText("api.project_input_invalid", "Please check your project details and try again."));

    if (error?.code === "FREE_VIDEO_PLAN_LIMIT_REACHED") { const upgradeLink = document.createElement("a"); upgradeLink.href = "/billing.html"; upgradeLink.className = "form-message-upgrade"; upgradeLink.textContent = uiText("quota.upgrade_plan", "Upgrade Plan"); formMessage.append(" ", upgradeLink); }

    formMessage.classList.add(
      "visible",
      "error"
    );
  } finally {
    createButton.disabled = false;
    createButton.innerHTML =
      originalButtonContent;

    regeneratePlanButton.disabled = false;
    regeneratePlanButton.innerHTML =
      originalRegenerateButtonContent;
  }

  if (
    !formMessage.classList.contains(
      "success-popover"
    )
  ) {
    formMessage.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }
});

renderImagePreviews();


/* Account-scoped history and stale-response protection. */
let quickAdHistoryUser = null;
let quickAdIdentityKnown = false;
let quickAdPageLeaving = false;
const quickAdAuthSignalKey = "quickadAuthChangeV1";

function quickAdReloadPrivatePage() {
  if (quickAdPageLeaving) return;
  quickAdPageLeaving = true;

  // Hide immediately, before navigation finishes.
  document.body.style.visibility = "hidden";
  window.location.reload();
}

function updateIntroCta(user) {
  const container =
    document.getElementById("intro-cta");

  const button =
    document.getElementById("intro-cta-button");

  const note =
    document.getElementById("intro-cta-note");

  if (!container || !button || !note) return;

  const signedIn = Boolean(user?.id);

  button.textContent = signedIn
    ? uiText("intro.cta_start", "Start Creating")
    : uiText("intro.cta_free", "Create Your First Video Free");

  note.textContent = signedIn
    ? ""
    : uiText(
        "intro.cta_free_note",
        "2 free videos · No subscription required"
      );

  note.hidden = signedIn;
  container.hidden = false;
}

const introCtaButton =
  document.getElementById("intro-cta-button");

introCtaButton?.addEventListener("click", () => {
  if (quickAdHistoryUser) {
    document.getElementById("upload-heading")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    return;
  }

  window.quickAdOpenSignup?.();
});

window.quickAdAccountChanged = (user) => {
  const nextId = typeof user?.id === "string" ? user.id : null;

  if (quickAdIdentityKnown && nextId !== quickAdHistoryUser) {
    quickAdReloadPrivatePage();
    return;
  }

  quickAdIdentityKnown = true;
  quickAdHistoryUser = nextId;
  updateIntroCta(user);
};

window.quickAdNotifyAccountChange = () => {
  // Contains no identity, credentials, or tokens.
  try {
    localStorage.setItem(quickAdAuthSignalKey, crypto.randomUUID());
  } catch {
    // Storage may be unavailable; focus/session checks remain active.
  }
};

window.addEventListener("storage", (event) => {
  if (event.key === quickAdAuthSignalKey) {
    quickAdReloadPrivatePage();
  }
});

async function quickAdReadSession() {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });

  if (response.status === 401) return null;

  const data = await response.json();
  if (!response.ok || !data.ok || !data.user?.id) {
    throw new Error("Your session could not be verified. Please try again.");
  }
  return data.user;
}

async function quickAdCheckPageSession() {
  const user = await quickAdReadSession();
  window.quickAdAccountChanged(user);
  return user;
}

async function quickAdProjectFetch(url, options = {}) {
  const user = await quickAdCheckPageSession();

  if (quickAdPageLeaving) {
    throw new Error(uiText("account.changed_reload", "Account changed. Reloading."));
  }

  if (!user) {
    throw new Error(uiText("account.sign_in_required", "Please sign in using the Account button first."));
  }

  const requestUserId = user.id;
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store"
  });

  // Delay delivery to existing UI code until identity is checked again.
  const data = await response.json();
  const isSuccessfulFinalize =
    url.includes("/finalize") &&
    response.status === 201 &&
    data?.ok === true;

  const currentUser =
    isSuccessfulFinalize
      ? user
      : await quickAdCheckPageSession();

  if (
    quickAdPageLeaving ||
    currentUser?.id !== requestUserId ||
    response.status === 401
  ) {
    quickAdReloadPrivatePage();
    throw new Error(uiText("account.session_changed", "Your account session changed. Reloading."));
  }

  return {
    ok: response.ok,
    status: response.status,
    async json() {
      if (quickAdPageLeaving || quickAdHistoryUser !== requestUserId) {
        throw new Error(uiText("account.changed_reload", "Account changed. Reloading."));
      }
      return data;
    }
  };
}

quickAdCheckPageSession()
  .catch(() => {});

window.addEventListener("focus", () => {
  if (!quickAdPageLeaving) {
    quickAdCheckPageSession().catch(() => {});
  }
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) quickAdReloadPrivatePage();
});



window.addEventListener('load', updateQuota);
setTimeout(updateQuota, 1000);




// --- AUTO-REFRESH QUOTA AFTER VIDEO READY (patched) ---
(function(){
  const origFetch = window.fetch;
  window.fetch = async function(...args){
    const res = await origFetch.apply(this, args);
    try{
      const url = String(args[0]||'');
      if(url.includes('/finalize') && res.status===201){
        setTimeout(()=>{ try{ updateQuota(); }catch(e){} }, 800);
      }
    }catch(e){}
    return res;
  };
})();

function updateDurationOptionsForPlan(usage) {
  currentPlanMaxVideoSeconds =
    Number(usage?.maxVideoSeconds) || 30;

  currentPlanId =
    String(usage?.planId || "free")
      .trim()
      .toLowerCase();

  const thirtySecondOption =
    durationOptions.find(
      (option) =>
        option.querySelector(
          'input[name="maxDurationSeconds"]'
        )?.value === "30"
    );

  const thirtySecondCost =
    thirtySecondOption?.querySelector("small");

  if (thirtySecondCost) {
    thirtySecondCost.textContent =
      currentPlanId === "free"
        ? uiText("duration.free_video", "Free video")
        : uiText("duration.credit_cost", "{count} credits", { count: 10 });
  }

  updateDurationAvailability();

  const durationNote =
    document.querySelector("#duration-note");

  if (durationNote) {
    durationNote.textContent =
      currentPlanMaxVideoSeconds <= 30
        ? uiText("duration.free_ai_note", "AI Decide is available, but Free videos are limited to 30 seconds. Upgrade to Starter or Pro for 45- and 60-second videos.")
        : uiText("duration.paid_ai_note", "AI Decide can choose the best 30-, 45-, or 60-second video length for your content.");
  }
}

async function updateQuota(){
  const banner =
    document.getElementById('quotaBanner');

  if(!banner) return;
  const renderQuotaBanner = ({
    type = 'free',
    planName = '',
    remaining = 2,
    total = 2,
  } = {}) => {
    const leftIcon =
      type === 'paid'
        ? '🎬'
        : '🎁';

    const leftText =
      type === 'paid'
        ? uiText(
            "quota.paid_html",
            "{plan}: <b>{remaining}</b> of {total} credits left",
            {
              plan: planName,
              remaining,
              total
            }
          )
        : uiText(
            "quota.free_html",
            "Free videos: <b>{remaining}</b> of {total} left",
            {
              remaining,
              total
            }
          );

    banner.innerHTML = `
      <div class="quota-status-item">
        <span class="quota-status-icon" aria-hidden="true">${leftIcon}</span>
        <span class="quota-status-text">${leftText}</span>
      </div>
    `;

    banner.style.display = 'flex';
  };

  try{
    const res =
      await fetch('/api/projects/usage');

    let usage = null;

    if(res.ok){
      const data =
        await res.json();

      usage =
        data.usage || null;

    }


    updateDurationOptionsForPlan(usage);

    if(usage?.planId && usage.planId !== 'free'){
      renderQuotaBanner({
        type: 'paid',
        planName:
          usage.planName || usage.planId,
        remaining:
          usage.monthlyCreditsRemaining ?? 0,
        total:
          usage.monthlyCreditsTotal ?? 0
      });
    } else {
      renderQuotaBanner({
        type: 'free',
        remaining:
          usage?.freeVideosRemaining ?? 2,
        total: 2
      });
    }
  }catch(e){
    console.warn(
      'quota error',
      e
    );

    renderQuotaBanner({
      type: 'free',
      remaining: 2,
      total: 2
    });
  }
}
// Run quota refresh on page load
document.addEventListener('DOMContentLoaded', ()=>{ setTimeout(updateQuota, 500); });
window.addEventListener('load', ()=>{ setTimeout(updateQuota, 1000); });


window.addEventListener("quickad:languagechange", () => {
  renderImagePreviews();

  if (
    !myVideosView?.hidden &&
    Array.isArray(latestRecoverableVideos)
  ) {
    renderRecoverableVideos(
      latestRecoverableVideos
    );
  }

  const ctaImage = ctaImageInput?.files?.[0];

  ctaImageName.textContent =
    ctaImage?.name ??
    uiText(
      "cta_image.none",
      "No image selected"
    );

  if (currentStoryboard) {
    renderCurrentScenePlan();
    validateVideoPlan();
  }
  updateQuota();
});
function getLocalizedCallToAction() {
  const selectedValue = callToActionSelect?.value || "Shop Now";
  if (selectedValue === "custom") {
    return customCtaInput?.value.trim() || "";
  }

  const ctaKeys = {
    "Shop Now": "cta.shop",
    "Learn More": "cta.learn",
    "Order Today": "cta.order",
    "Visit Our Website": "cta.visit",
    "Book Now": "cta.book"
  };

  return uiText(ctaKeys[selectedValue] || "cta.shop", selectedValue);
}
function roleText(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return uiText(`scene.role.${normalized}`, role || "");
}
function localizedApiError(result) {
  const codeToMessage = {
    PROJECT_BUSY: {
      key: "api.project_busy",
      fallback:
        "This project is busy. Please wait until processing finishes."
    },

    PROJECT_CREATE_BUSY: {
      key: "api.project_busy",
      fallback:
        "Another project is already being created. Please wait until it finishes."
    },

    VIDEO_FINALIZE_BUSY: {
      key: "api.project_busy",
      fallback:
        "Another video is already being generated. Please wait until it finishes."
    },

    APP_ORIGIN_MISCONFIGURED: {
      key: "api.app_origin_misconfigured",
      fallback:
        "QuickAd AI is not configured correctly for this request."
    },

    REQUEST_ORIGIN_INVALID: {
      key: "account.api_origin_required",
      fallback:
        "This request must come from QuickAd AI."
    },

    PROJECT_ID_INVALID: {
      key: "api.project_id_invalid",
      fallback:
        "The project address is invalid."
    },

    PROJECT_NOT_FOUND: {
      key: "api.project_not_found",
      fallback:
        "The project was not found."
    },

    PROJECT_ACCESS_FAILED: {
      key: "api.project_access_failed",
      fallback:
        "Project access could not be verified. Please try again."
    },

    USAGE_LOAD_FAILED: {
      key: "billing.usage_load_error",
      fallback:
        "Usage could not be loaded."
    },

    VIDEO_DURATION_LIMIT_EXCEEDED: {
      key: "quota.duration_limit_exceeded",
      fallback:
        "Your current plan does not support the requested video duration."
    },

    VIDEO_DURATION_NOT_ALLOWED: {
      key: "quota.duration_not_allowed",
      fallback:
        "Your current plan does not support this video duration or number of images."
    },

    FREE_VIDEO_PLAN_LIMIT_REACHED: {
      key: "quota.free_video_plan_limit_reached",
      fallback:
        "You’ve reached the free limit for creating video plans. Upgrade your plan to continue."
    },

    FREE_VIDEO_LIMIT_REACHED: {
      key: "quota.free_limit_reached",
      fallback:
        "You have used your 2 free videos. Upgrade to create more videos. Your existing videos and previews remain available."
    },

    CREDIT_LIMIT_REACHED: {
      key: "quota.credit_limit_reached",
      fallback:
        "You do not have enough video credits remaining for another video."
    },

    STORYBOARD_GENERATION_FAILED: {
      key: "api.storyboard_generation_failed",
      fallback:
        "Your video plan could not be generated. Please try again."
    },

    PROJECT_DURATION_INVALID: {
      key: "duration.invalid_choice",
      fallback:
        "Please choose AI Decide or a video length of 30, 45, or 60 seconds."
    },

    PROJECT_IMAGE_REQUIRED: {
      key: "upload.required",
      fallback:
        "Please upload at least one product image."
    },

    PROJECT_IMAGE_LIMIT: {
      key: "upload.plan_image_limit",
      fallback:
        "QuickAd AI supports up to 10 product images."
    },

    PROJECT_DURATION_IMAGE_LIMIT: {
      key: "upload.duration_image_limit",
      fallback:
        "This video duration supports fewer product images."
    },

    PROJECT_WEBSITE_INVALID: {
      key: "website.invalid",
      fallback:
        "Enter a valid website address."
    },

    PROJECT_STYLE_INVALID: {
      key: "style.invalid",
      fallback:
        "Please choose a valid video style."
    },

    PROJECT_INPUT_INVALID: {
      key: "api.project_input_invalid",
      fallback:
        "Please check your project details and try again."
    },

    PROJECT_ASSET_NAME_INVALID: {
      key: "saved.asset_name_invalid",
      fallback:
        "The project asset name is invalid."
    },

    PROJECT_ASSET_NOT_FOUND: {
      key: "saved.asset_not_found",
      fallback:
        "The project asset was not found."
    },

    PROJECT_ASSET_OPEN_FAILED: {
      key: "saved.asset_open_failed",
      fallback:
        "The project asset could not be opened."
    },

    FINISHED_VIDEO_NOT_FOUND: {
      key: "saved.video_missing",
      fallback:
        "The saved video file is unavailable."
    },

    MUSIC_TRACK_INVALID: {
      key: "api.music_track_invalid",
      fallback:
        "Please choose a valid background music track."
    },

    MUSIC_UNAVAILABLE: {
      key: "api.music_unavailable",
      fallback:
        "The selected background music is unavailable. Please choose another track or no music."
    },

    MUSIC_VOLUME_INVALID: {
      key: "api.music_volume_invalid",
      fallback:
        "Please choose a music volume from 0 to 100 percent."
    },

    VIDEO_ALREADY_COMPLETE: {
      key: "api.video_already_complete",
      fallback:
        "This video is already complete. Create a new project to choose different music."
    },

    MUSIC_PREPARATION_FAILED: {
      key: "api.music_preparation_failed",
      fallback:
        "Background music could not be prepared. Please try again."
    },

    NARRATOR_INVALID: {
      key: "api.narrator_invalid",
      fallback:
        "Please choose a valid narrator."
    },

    SCENE_CAPTION_INVALID: {
      key: "review.caption_rule",
      fallback:
        "Captions must contain 1–60 characters."
    },

    STORYBOARD_INVALID: {
      key: "api.storyboard_invalid",
      fallback:
        "Your video plan contains invalid scene information. Please review it and try again."
    },

    FINAL_VIDEO_GENERATION_FAILED: {
      key: "api.final_video_generation_failed",
      fallback:
        "The final video could not be created. Please try again."
    }
  };

  const mapped =
    typeof result?.code === "string"
      ? codeToMessage[result.code]
      : null;

  if (!mapped) {
    return "";
  }

  return uiText(
    mapped.key,
    mapped.fallback,
    result?.params &&
    typeof result.params === "object"
      ? result.params
      : {}
  );
}
