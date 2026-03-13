import { readFileSync, readdirSync } from "fs";
import { parse as parseYaml } from "yaml";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workflowDir = join(__dirname, "../src/server/workflows");
const yamlFiles = readdirSync(workflowDir).filter((f) => f.endsWith(".yaml"));

let errors = 0;

for (const file of yamlFiles) {
  try {
    const content = readFileSync(join(workflowDir, file), "utf-8");
    const parsed = parseYaml(content);
    if (!parsed.name) throw new Error("Missing 'name' field");
    if (!parsed.steps || !Array.isArray(parsed.steps))
      throw new Error("Missing or invalid 'steps' field");
    if (!parsed.organizationId) throw new Error("Missing 'organizationId' field");
    if (!parsed.trigger) throw new Error("Missing 'trigger' field");

    // Collect all step IDs (recursively)
    const allStepIds = new Set<string>();
    function collectStepIds(steps: any[]) {
      for (const step of steps) {
        if (!step.id) throw new Error(`Step missing 'id' field`);
        if (!step.type) throw new Error(`Step "${step.id}" missing 'type' field`);
        if (allStepIds.has(step.id))
          throw new Error(`Duplicate step ID: "${step.id}"`);
        allStepIds.add(step.id);
        if (step.steps) collectStepIds(step.steps);
        if (step.onTrue) collectStepIds(step.onTrue);
        if (step.onFalse) collectStepIds(step.onFalse);
      }
    }
    collectStepIds(parsed.steps);

    // Check dependsOn references
    function checkDependsOn(steps: any[]) {
      for (const step of steps) {
        if (step.dependsOn) {
          for (const dep of step.dependsOn) {
            if (!allStepIds.has(dep))
              throw new Error(
                `Step "${step.id}" depends on unknown step "${dep}"`,
              );
          }
        }
        if (step.steps) checkDependsOn(step.steps);
        if (step.onTrue) checkDependsOn(step.onTrue);
        if (step.onFalse) checkDependsOn(step.onFalse);
      }
    }
    checkDependsOn(parsed.steps);

    // Validate step types have required fields
    function validateSteps(steps: any[]) {
      for (const step of steps) {
        switch (step.type) {
          case "agent-delegate":
            if (!step.agent)
              throw new Error(`Step "${step.id}": agent-delegate missing 'agent'`);
            if (!step.prompt)
              throw new Error(`Step "${step.id}": agent-delegate missing 'prompt'`);
            break;
          case "action":
            if (!step.action)
              throw new Error(`Step "${step.id}": action missing 'action'`);
            break;
          case "condition":
            if (!step.condition)
              throw new Error(`Step "${step.id}": condition missing 'condition'`);
            if (!step.onTrue || !Array.isArray(step.onTrue))
              throw new Error(`Step "${step.id}": condition missing 'onTrue'`);
            validateSteps(step.onTrue);
            if (step.onFalse) validateSteps(step.onFalse);
            break;
          case "forEach":
            if (!step.collection)
              throw new Error(`Step "${step.id}": forEach missing 'collection'`);
            if (!step.as)
              throw new Error(`Step "${step.id}": forEach missing 'as'`);
            if (!step.steps || !Array.isArray(step.steps))
              throw new Error(`Step "${step.id}": forEach missing 'steps'`);
            validateSteps(step.steps);
            break;
          case "while":
            if (!step.condition)
              throw new Error(`Step "${step.id}": while missing 'condition'`);
            if (!step.steps) throw new Error(`Step "${step.id}": while missing 'steps'`);
            validateSteps(step.steps);
            break;
          case "parallel":
            if (!step.steps)
              throw new Error(`Step "${step.id}": parallel missing 'steps'`);
            validateSteps(step.steps);
            break;
          default:
            throw new Error(`Step "${step.id}": unknown type "${step.type}"`);
        }
      }
    }
    validateSteps(parsed.steps);

    console.log(`✅ ${file} — ${allStepIds.size} steps, valid`);
  } catch (err) {
    console.error(`❌ ${file} — ${(err as Error).message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} workflow(s) have errors`);
  process.exit(1);
} else {
  console.log(`\nAll ${yamlFiles.length} workflows valid ✅`);
}
