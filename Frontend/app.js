const MAX_IMAGES = 10;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const form = document.querySelector("#video-form");
const imageInput = document.querySelector("#product-images");
const logoInput = document.querySelector("#product-logo");
const uploadZone = document.querySelector("#upload-zone");
const previewList = document.querySelector("#image-preview-list");
const imageCount = document.querySelector("#image-count");
const logoName = document.querySelector("#logo-name");
const description = document.querySelector("#description");
const characterCount = document.querySelector("#character-count");
const uploadError = document.querySelector("#upload-error");
const descriptionError = document.querySelector("#description-error");
const formMessage = document.querySelector("#form-message");
const createButton = document.querySelector("#create-button");
const styleOptions = [...document.querySelectorAll(".style-option")];

let selectedImages = [];

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

function renderImagePreviews() {
  previewList.replaceChildren();

  selectedImages.forEach((file, index) => {
    const preview = document.createElement("div");
    preview.className = "image-preview";

    const image = document.createElement("img");
    image.alt = `Selected product image ${index + 1}`;

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

  imageCount.textContent = `${selectedImages.length} of ${MAX_IMAGES}`;

  if (selectedImages.length > 0) {
    imageCount.style.color = "var(--success)";
  } else {
    imageCount.style.color = "";
  }
}

function addImages(files) {
  setUploadError();

  const incomingFiles = [...files];

  const invalidFile = incomingFiles.find(
    (file) => !ALLOWED_TYPES.has(file.type)
  );

  if (invalidFile) {
    setUploadError(
      "Please use only JPG, PNG, or WebP product images."
    );
    return;
  }

  const existingKeys = new Set(selectedImages.map(fileKey));
  const uniqueFiles = incomingFiles.filter(
    (file) => !existingKeys.has(fileKey(file))
  );

  if (selectedImages.length + uniqueFiles.length > MAX_IMAGES) {
    setUploadError(
      `You can upload a maximum of ${MAX_IMAGES} product images.`
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

logoInput.addEventListener("change", () => {
  const logo = logoInput.files[0];

  if (!logo) {
    logoName.textContent = "";
    return;
  }

  if (!ALLOWED_TYPES.has(logo.type)) {
    logoInput.value = "";
    logoName.textContent = "";
    setUploadError(
      "Please use a JPG, PNG, or WebP logo."
    );
    return;
  }

  setUploadError();
  logoName.textContent = logo.name;
});

description.addEventListener("input", () => {
  characterCount.textContent = `${description.value.length} / 500`;

  if (description.value.trim()) {
    descriptionError.textContent = "";
  }
});

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  setUploadError();
  descriptionError.textContent = "";
  formMessage.classList.remove(
    "visible",
    "error",
    "success-card",
    "success-popover"
  );
  formMessage.textContent = "";

  let firstInvalidElement = null;

  if (selectedImages.length === 0) {
    setUploadError("Please add at least one product image.");
    firstInvalidElement = uploadZone;
  }

  if (!description.value.trim()) {
    descriptionError.textContent =
      "Please describe the product or business you want to promote.";

    if (!firstInvalidElement) {
      firstInvalidElement = description;
    }
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

  createButton.disabled = true;
  createButton.innerHTML =
    "<span>Creating your storyboard and narration...</span><span>•••</span>";

  try {
    syncImageInput();

    const projectData = new FormData(form);

    const response = await fetch(
      "/api/projects",
      {
        method: "POST",
        body: projectData
      }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ||
        "QuickAd AI could not create the project."
      );
    }

    const shortProjectId =
      result.project.id.slice(0, 8);

    const sceneCount =
      result.storyboard.scenes.length;

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
      "Your AI video plan is ready";

    const successDetails =
      document.createElement("span");

    successDetails.className =
      "success-details";

    successDetails.textContent =
      `Project ${shortProjectId} • ` +
      `"${result.storyboard.title}" • ` +
      `${sceneCount} scenes • ` +
      `${result.narration.voice} AI narration • ` +
      `${result.storyboard.totalDurationSeconds} seconds`;

    const successNext =
      document.createElement("span");

    successNext.className =
      "success-next";

    successNext.textContent =
      "Your images, storyboard, and narration were created successfully.";

    successContent.append(
      successTitle,
      successDetails,
      successNext
    );

    formMessage.replaceChildren(
      successMark,
      successContent
    );
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

      formMessage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }, 3000);
  } catch (error) {
    formMessage.textContent =
      error.message ||
      "QuickAd AI could not create the project.";

    formMessage.classList.add(
      "visible",
      "error"
    );
  } finally {
    createButton.disabled = false;
    createButton.innerHTML =
      originalButtonContent;
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
