export interface ExamConfig {
  showScoreToStudent: boolean;
  maxAttemptsPerStudent: number;
  instructionsText: string;
}

export function parseExamConfig(instructions?: string | null): ExamConfig {
  if (!instructions) {
    return { showScoreToStudent: true, maxAttemptsPerStudent: 1, instructionsText: "" };
  }

  // Check for embedded JSON tag <!--CONFIG:{"show_score_to_student":false,"max_attempts":2}-->
  const match = instructions.match(/<!--CONFIG:(.*?)-->/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      const maxAtt = typeof data.max_attempts === 'number' ? data.max_attempts : 1;
      return {
        showScoreToStudent: data.show_score_to_student !== false,
        maxAttemptsPerStudent: maxAtt,
        instructionsText: instructions.replace(/<!--CONFIG:.*?-->/g, "").trim(),
      };
    } catch {}
  }

  // Check if entire string is JSON
  if (instructions.trim().startsWith("{") && instructions.trim().endsWith("}")) {
    try {
      const data = JSON.parse(instructions);
      const maxAtt = typeof data.max_attempts === 'number' ? data.max_attempts : 1;
      return {
        showScoreToStudent: data.show_score_to_student !== false,
        maxAttemptsPerStudent: maxAtt,
        instructionsText: data.instructions_text || data.instructions || "",
      };
    } catch {}
  }

  return { showScoreToStudent: true, maxAttemptsPerStudent: 1, instructionsText: instructions };
}

export function serializeExamConfig(
  instructionsText: string,
  showScoreToStudent: boolean = true,
  maxAttemptsPerStudent: number = 1
): string {
  const cleanText = (instructionsText || "").replace(/<!--CONFIG:.*?-->/g, "").trim();
  const config: Record<string, any> = {};

  if (!showScoreToStudent) {
    config.show_score_to_student = false;
  }
  if (maxAttemptsPerStudent !== 1) {
    config.max_attempts = maxAttemptsPerStudent;
  }

  if (Object.keys(config).length === 0) {
    return cleanText;
  }
  return (cleanText + `\n<!--CONFIG:${JSON.stringify(config)}-->`).trim();
}
