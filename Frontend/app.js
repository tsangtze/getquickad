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
const planReview = document.querySelector("#plan-review");
const planScenes = document.querySelector("#plan-scenes");
const planStatus = document.querySelector("#plan-status");
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
let currentProjectId = "";
let currentStoryboard = null;
let reviewImageUrls = [];

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

function clearReviewImageUrls() {
  reviewImageUrls.forEach((imageUrl) => {
    URL.revokeObjectURL(imageUrl);
  });

  reviewImageUrls = [];
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

const SCENE_TIMELINES = {
  3: [
    [0, 7],
    [7, 17],
    [17, 25]
  ],
  4: [
    [0, 5],
    [5, 12],
    [12, 19],
    [19, 25]
  ],
  5: [
    [0, 4],
    [4, 9],
    [9, 15],
    [15, 20],
    [20, 25]
  ]
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
    `${sceneCount} scene${sceneCount === 1 ? "" : "s"} in this plan · Minimum 3`;

  undoSceneButton.hidden =
    deletedSceneHistory.length === 0;
}

function normalizeSceneTimeline({
  transferCallToAction = false
} = {}) {
  const scenes =
    currentStoryboard.scenes;

  const timeline =
    SCENE_TIMELINES[scenes.length];

  if (!timeline) {
    throw new Error(
      "A video plan must contain between 3 and 5 scenes."
    );
  }

  scenes.forEach((scene, index) => {
    scene.sceneNumber =
      index + 1;

    scene.startSeconds =
      timeline[index][0];

    scene.endSeconds =
      timeline[index][1];

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
      finalScene.caption =
        callToAction.slice(0, 60);

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

  currentStoryboard.totalDurationSeconds =
    25;

  currentStoryboard.narrationWordCount =
    countNarrationWords(scenes);
}

function renderCurrentScenePlan() {
  planScenes.replaceChildren();

  currentStoryboard.scenes.forEach(
    (scene) => {
      scene.narration =
        String(scene.caption ?? "").trim();

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

  planStatus.textContent =
    `Scene deleted. Review and confirm the remaining ${currentStoryboard.scenes.length} scenes.`;
}

function validateVideoPlan() {
  if (!currentStoryboard) {
    finalVideoButton.disabled = true;
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
          scene.imageIndex > selectedImages.length
        );
      }
    );

  if (invalidScene) {
    finalVideoButton.disabled = true;
    planStatus.textContent =
      `Scene ${invalidScene.sceneNumber} needs a valid picture and a caption containing 1–60 characters.`;

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
    planStatus.textContent =
      `${approvedCount} of ${totalScenes} scenes approved. Confirm every scene to create the final video.`;

    return false;
  }

  finalVideoButton.disabled = false;
  planStatus.textContent =
    `All ${totalScenes} scenes are approved. You can now create the final video.`;

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
  sceneTitle.textContent =
    `Scene ${scene.sceneNumber}`;

  const sceneTiming = document.createElement("small");
  sceneTiming.textContent =
    `${scene.startSeconds}–${scene.endSeconds} seconds • ${scene.role}`;

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
    "AI suggested";

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
    "Delete Scene";

  deleteSceneButton.disabled =
    currentStoryboard.scenes.length <= 3;

  deleteSceneButton.title =
    deleteSceneButton.disabled
      ? "A video must retain at least 3 scenes."
      : "Remove this scene from the video.";

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
  picture.alt =
    `Picture assigned to scene ${scene.sceneNumber}`;

  picture.src =
    reviewImageUrls[scene.imageIndex - 1] ||
    "";

  pictureFrame.append(picture);

  const pictureLabel = document.createElement("label");
  pictureLabel.textContent = "Picture";

  const pictureSelect =
    document.createElement("select");

  pictureSelect.className =
    "scene-picture-select";

  pictureSelect.setAttribute(
    "aria-label",
    `Picture for scene ${scene.sceneNumber}`
  );

  selectedImages.forEach(
    (file, imageIndex) => {
      const option =
        document.createElement("option");

      option.value =
        String(imageIndex + 1);

      option.textContent =
        `Picture ${imageIndex + 1}: ${file.name}`;

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

  pictureColumn.append(
    pictureFrame,
    pictureLabel
  );

  const captionColumn = document.createElement("div");
  captionColumn.className = "scene-caption-column";

  const captionLabel = document.createElement("label");
  captionLabel.textContent = "AI caption";

  const captionInput =
    document.createElement("textarea");

  captionInput.className =
    "scene-caption-input";

  captionInput.rows = 2;
  captionInput.maxLength = 60;
  captionInput.value =
    scene.caption;

  captionInput.setAttribute(
    "aria-label",
    `Caption for scene ${scene.sceneNumber}`
  );

  const captionMeta = document.createElement("div");
  captionMeta.className = "scene-caption-meta";

  const captionAdvice =
    document.createElement("span");

  captionAdvice.textContent =
    "Recommended: 3–8 words · Maximum: 60 characters";

  const captionCounter =
    document.createElement("span");

  captionCounter.textContent =
    `${captionInput.value.length} / 60 characters`;

  captionInput.addEventListener(
    "input",
    () => {
      scene.caption =
        captionInput.value;

      scene.narration =
        captionInput.value.trim();

      narrationText.textContent =
        scene.narration;

      currentStoryboard.narrationWordCount =
        countNarrationWords(
          currentStoryboard.scenes
        );

      captionCounter.textContent =
        `${captionInput.value.length} / 60 characters`;

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
    "Narration preview";

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
        "Scene approved";

      approvalBadge.classList.add(
        "approved"
      );

      confirmSceneButton.textContent =
        "✓ Scene approved";

      confirmSceneButton.classList.add(
        "approved"
      );
    } else {
      approvalBadge.textContent =
        "Needs approval";

      approvalBadge.classList.remove(
        "approved"
      );

      confirmSceneButton.textContent =
        "Confirm Scene";

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
        scene.imageIndex <= selectedImages.length;

      if (!validScene) {
        scene.approved = false;

        updateSceneApprovalState();
        validateVideoPlan();

        return;
      }

      scene.caption = caption;
      scene.narration = caption;
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

function renderVideoPlanReview(
  project,
  storyboard
) {
  clearReviewImageUrls();

  reviewImageUrls =
    selectedImages.map(
      (file) =>
        URL.createObjectURL(file)
    );

  currentProjectId =
    project.id;

  currentStoryboard =
    JSON.parse(
      JSON.stringify(storyboard)
    );

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

    planStatus.textContent =
      `Deleted scene restored. Review and confirm all ${currentStoryboard.scenes.length} scenes.`;
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

    const originalButtonText =
      finalVideoButton.textContent;

    finalVideoButton.disabled = true;
    finalVideoButton.textContent =
      "Creating Final Video...";

    planStatus.classList.remove(
      "approved"
    );

    planStatus.textContent =
      "Generating your selected AI narration and rendering the final MP4. This may take about one minute.";

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

      const response = await fetch(
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
            narratorChoice:
              selectedNarratorVoice()
          })
        }
      );

      const result =
        await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
          "The final video could not be created."
        );
      }

      finalVideoButton.textContent =
        "Video Ready ✓";

      planStatus.classList.add(
        "approved",
        "video-result-card"
      );

      const resultHeading =
        document.createElement("strong");

      resultHeading.className =
        "video-result-heading";

      resultHeading.textContent =
        "Your final video is ready";

      const resultSummary =
        document.createElement("span");

      resultSummary.className =
        "video-result-summary";

      resultSummary.textContent =
        `${currentStoryboard.scenes.length} scenes · 25-second MP4 · AI narration complete`;

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
        "▶ Watch Video";

      const downloadLink =
        document.createElement("a");

      downloadLink.href =
        result.videoUrl;

      downloadLink.download =
        "quickad-video.mp4";

      downloadLink.className =
        "video-result-link";

      downloadLink.textContent =
        "↓ Download MP4";

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
        "Your final video is ready";

      const successDetails =
        document.createElement("span");

      successDetails.textContent =
        `${currentStoryboard.scenes.length} scenes · AI narration · 25-second MP4`;

      const successNext =
        document.createElement("small");

      successNext.textContent =
        "Your approved video was rendered successfully. Watch or download it below.";

      successContent.append(
        successTitle,
        successDetails,
        successNext
      );

      formMessage.replaceChildren(
        successMark,
        successContent
      );

      formMessage.classList.remove(
        "error"
      );

      formMessage.classList.add(
        "visible",
        "success-card",
        "success-popover"
      );

      window.setTimeout(() => {
        formMessage.classList.remove(
          "success-popover"
        );

        planStatus.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }, 3000);
    } catch (error) {
      finalVideoButton.disabled = false;
      finalVideoButton.textContent =
        originalButtonText;

      planStatus.classList.remove(
        "approved"
      );

      planStatus.textContent =
        error.message ||
        "The final video could not be created.";
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
      `${customCtaInput.value.length} / 40 characters`;

    customCtaError.textContent = "";
  }
);

updateCustomCtaField();

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
    "<span>Creating your video plan...</span><span>•••</span>";

  try {
    syncImageInput();

    const projectData = new FormData(form);

    if (
      callToActionSelect.value ===
      "custom"
    ) {
      const customCallToAction =
        customCtaInput.value.trim();

      if (!customCallToAction) {
        customCtaError.textContent =
          "Enter your call to action.";

        customCtaInput.focus();

        throw new Error(
          "Please enter your custom call to action."
        );
      }

      projectData.set(
        "callToAction",
        customCallToAction
      );
    }

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

    renderVideoPlanReview(
      result.project,
      result.storyboard
    );

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
      `${result.storyboard.totalDurationSeconds} seconds`;
    const successNext =
      document.createElement("span");

    successNext.className =
      "success-next";

    successNext.textContent =
      "Review the assigned pictures and AI captions before creating narration and video.";

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

      planReview.scrollIntoView({
        behavior: "smooth",
        block: "start"
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
