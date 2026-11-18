import { provideBrowserGlobalErrorListeners } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { App } from "./app/app";
import { routes } from "./app/routes";

// Route parameters and query parameters arrive as the pages' inputs (withComponentInputBinding).
bootstrapApplication(App, { providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes, withComponentInputBinding())] }).catch((error) => console.error(error));
