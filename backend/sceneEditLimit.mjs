export function countSceneEditUnits(
  value
) {
  const text =
    String(value ?? "");

  return (
    text.match(/[\p{L}\p{N}]/gu) || []
  ).length;
}

export function findSceneExceedingAiOriginal({
  originalScenes,
  editedScenes
}) {
  const originalScenesByNumber =
    new Map(
      originalScenes.map(
        (scene) => [
          Number(scene.sceneNumber),
          scene
        ]
      )
    );

  return (
    editedScenes.find(
      (scene) => {
        const originalScene =
          originalScenesByNumber.get(
            Number(scene.sceneNumber)
          );

        if (!originalScene) {
          return true;
        }

        const originalNarration =
          String(
            originalScene.narration ?? ""
          );

        return (
          countSceneEditUnits(
            scene.narration
          ) >
          countSceneEditUnits(
            originalNarration
          )
        );
      }
    ) || null
  );
}
