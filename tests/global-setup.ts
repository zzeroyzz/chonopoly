import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const AUTH_FILE = path.join(".playwright", "user.json");

export default async function globalSetup() {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000/login");
  await page.fill('input[name="email"]', process.env.TEST_EMAIL);
  await page.fill('input[name="password"]', process.env.TEST_PASSWORD);
  await page.click('button[type="submit"]');
  // Login lands on the pipeline — the hub is gone and the pipeline is home.
  await page.waitForURL("http://localhost:3000/pipeline");
  await context.storageState({ path: AUTH_FILE });
  await browser.close();
}
