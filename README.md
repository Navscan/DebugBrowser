# DebugBrowser

**The Mobile F12 Console.**

DebugBrowser is a specialized, ultra-lightweight Android WebView wrapper designed to inject `DebugOTool`—a fully featured, Shadow DOM-isolated developer console—into any web application. It bridges the gap between desktop DevTools and mobile testing, allowing developers and QA engineers to inspect network traffic, view console logs, manipulate local storage, and traverse the DOM directly on a mobile device.

## The 16KB Build Hack (The Massive Flex)

Most standard Android projects rely on Gradle, which pulls in megabytes of support libraries, Kotlin runtimes, and boilerplate resources, resulting in a bloated APK (usually 2MB+ for a simple WebView).

**DebugBrowser bypasses Gradle entirely.**

Using a custom shell script executed via Termux, this project manually compiles and packages the APK using raw Android SDK build tools:
1.  **`aapt`**: Compiles resources and generates the `R.java` file.
2.  **`javac`**: Compiles the bare-bones Java source (no AndroidX, no support libraries).
3.  **`dx`**: Converts the Java classes into Dalvik Executable (`.dex`) format.
4.  **`apksigner`**: Signs the final packaged APK.

By stripping away all modern Android bloat and relying strictly on native Android SDK components, we achieve a functional, highly capable WebView browser in an **unbelievably tiny 16.89 KB APK file**. 

### Build Scripts Included
- `env_vari.bash`: Sets the Termux environment variables for the Android SDK.
- `cmd_cd-rm.bash`: Cleans up previous build artifacts.
- `aapt_package.bash`: The core compilation and packaging script.
- `apk_copy.bash`: Copies the compiled APK to the device's download folder.

## Features (F12 on Mobile)

The injected `DebugOTool.js` (v5.2) operates entirely inside a **Shadow DOM**, ensuring that the debugger's CSS never breaks the host website, and the host website's CSS never breaks the debugger.

- **Network Interceptor**: Hooks `window.fetch` to log all API requests, responses, status codes, and payloads in real-time.
- **Console Logging**: Overrides native `console.log`, `console.warn`, and `console.error` to capture stack traces directly in the UI.
- **Collapsible DOM Tree**: A full Elements tab that renders the document structure like a file explorer. Click any node to highlight it on the actual page.
- **Storage Manager**: View, edit, and delete `localStorage`, `sessionStorage`, and cookies on the fly.
- **Service Worker Control**: View registered service workers and unregister them to bypass aggressive caching.
- **Performance Metrics**: Real-time FPS counter, memory usage, and navigation timing.
- **Native Bridge**: Communicates with `MainActivity.java` to trigger native Android functions (like the address bar toggle or file downloads).

## Deep Device Introspection (No Mask)

Because the app bridges the WebView and the native Android layer, it can extract highly specific device data without obfuscation. 
- **Un-masked Tokens**: Extracts JWT payloads, client codes, emails, and franchise IDs directly from the page's local storage.
- **Device Fingerprinting**: Captures the exact `navigator.userAgent`, screen resolution, device pixel ratio, and hardware concurrency. 
- **Header Injection**: The native `DownloadManager` bypasses standard browser restrictions, allowing raw text reports to be saved directly to the device's scoped storage.

## Architecture

- **`MainActivity.java`**: The native Android shell. It initializes the `WebView`, enables JavaScript and DOM storage, and silently injects `DebugOTool.js` into the `onPageFinished` event of every page loaded.
- **`tools/DebugOTool.js`**: The payload. A massive, self-contained JavaScript file that builds the UI, intercepts network requests, and manages state.
- **`tools/DebugOTool.html` & `.css`**: A standalone launcher page hosted on the server, allowing users to copy the debugger script as a bookmarklet or download the APK directly.

## Deployment

1. **The Server**: Host `DebugOTool.js`, `.html`, and `.css` on your web server (e.g., `/var/www/treasuretrail-suite/tools/`).
2. **The App**: Compile the APK using the provided Termux scripts.
3. **The Injection**: Open the DebugBrowser app, type in your staging URL, and the debug bar will automatically appear at the bottom of the screen.
