import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const app = service("asr-app", {
    source: github("Matrixai211/ASR-App", {
      branch: "feature/artist-distribution-studio",
    }),
    preDeploy: "npm run db:deploy",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
  });

  return project("ASR App", {
    resources: [app],
  });
});
