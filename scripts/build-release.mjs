#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(repoRoot, 'Release');
const mobileAppDir = path.join(repoRoot, 'apps', 'mobile-app');

function resolveTargetVersion() {
  const cliArg = process.argv[2]?.trim();
  if (cliArg) {
    return cliArg.replace(/^v(ersion)?\s*/i, '');
  }

  if (!fs.existsSync(releaseRoot)) {
    return '1.0';
  }

  const entries = fs.readdirSync(releaseRoot, { withFileTypes: true });
  const versions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = /^version\s+(\d+)\.(\d+)$/i.exec(entry.name.trim());
    if (match) {
      versions.push({
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10)
      });
    }
  }

  if (versions.length === 0) {
    return '1.0';
  }

  versions.sort((a, b) =>
    a.major !== b.major ? b.major - a.major : b.minor - a.minor
  );
  const latest = versions[0];
  return `${latest.major}.${latest.minor + 1}`;
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function main() {
  const version = resolveTargetVersion();
  const [majorStr, minorStr = '0'] = version.split('.');
  const versionCode =
    Number.parseInt(majorStr, 10) * 10 + Number.parseInt(minorStr, 10);
  const targetDir = path.join(releaseRoot, `version ${version}`);

  console.log(`\n========================================================`);
  console.log(`Building VeerXcape Mobile Release — version ${version} (code ${versionCode})`);
  console.log(`Target Directory: ${targetDir}`);
  console.log(`========================================================\n`);

  // 1. Update Android versionCode & versionName in apps/mobile-app/android/app/build.gradle
  const appBuildGradlePath = path.join(
    mobileAppDir,
    'android',
    'app',
    'build.gradle'
  );
  if (fs.existsSync(appBuildGradlePath)) {
    let gradleText = fs.readFileSync(appBuildGradlePath, 'utf8');
    gradleText = gradleText
      .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
      .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
    fs.writeFileSync(appBuildGradlePath, gradleText, 'utf8');
  }

  // 2. Update iOS MARKETING_VERSION & CURRENT_PROJECT_VERSION
  const pbxprojPath = path.join(
    mobileAppDir,
    'ios',
    'App',
    'App.xcodeproj',
    'project.pbxproj'
  );
  if (fs.existsSync(pbxprojPath)) {
    let pbxText = fs.readFileSync(pbxprojPath, 'utf8');
    pbxText = pbxText
      .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
      .replace(
        /CURRENT_PROJECT_VERSION = [^;]+;/g,
        `CURRENT_PROJECT_VERSION = ${versionCode};`
      );
    fs.writeFileSync(pbxprojPath, pbxText, 'utf8');
  }

  const javaHome =
    process.env.JAVA_HOME ||
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const androidHome =
    process.env.ANDROID_HOME ||
    path.join(process.env.HOME || '', 'Library', 'Android', 'sdk');

  const buildEnv = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    PATH: `${javaHome}/bin:${androidHome}/platform-tools:${process.env.PATH || ''}`
  };

  // 3. Build web assets & sync Capacitor
  console.log('-> Building @veerxcape/mobile-app web bundle & syncing Capacitor...');
  execSync('npm run build && npx cap sync', {
    cwd: mobileAppDir,
    env: buildEnv,
    stdio: 'inherit'
  });

  // 4. Build Android APKs
  console.log('-> Assembling Android Debug (signed) & Release APKs...');
  execSync('./gradlew assembleDebug assembleRelease', {
    cwd: path.join(mobileAppDir, 'android'),
    env: buildEnv,
    stdio: 'inherit'
  });

  // 5. Prepare Release/version X.Y folder
  fs.mkdirSync(targetDir, { recursive: true });

  const debugApkSrc = path.join(
    mobileAppDir,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'debug',
    'app-debug.apk'
  );
  const releaseUnsignedApkSrc = path.join(
    mobileAppDir,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release-unsigned.apk'
  );

  const apkDest = path.join(targetDir, `VeerXcape-v${version}.apk`);
  const releaseUnsignedApkDest = path.join(
    targetDir,
    `VeerXcape-v${version}-release-unsigned.apk`
  );

  fs.copyFileSync(debugApkSrc, apkDest);
  if (fs.existsSync(releaseUnsignedApkSrc)) {
    fs.copyFileSync(releaseUnsignedApkSrc, releaseUnsignedApkDest);
  }

  // 6. Copy openable iOS Xcode project & build iOS Simulator .app bundle
  const iosOpenableDest = path.join(targetDir, 'ios-openable');
  fs.rmSync(iosOpenableDest, { recursive: true, force: true });
  fs.cpSync(path.join(mobileAppDir, 'ios'), iosOpenableDest, {
    recursive: true,
    filter: (src) =>
      !src.includes('/Pods') &&
      !src.includes('/build') &&
      !src.includes('/DerivedData') &&
      !src.includes('/xcuserdata')
  });

  // Build iOS Simulator .app using xcodebuild if available
  const derivedDataPath = path.join(
    '/tmp',
    `veerxcape-ios-build-v${version.replace(/\./g, '_')}`
  );
  let iosAppZipName = null;
  try {
    console.log('-> Building iOS Simulator .app bundle via xcodebuild...');
    execSync(
      `xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -derivedDataPath "${derivedDataPath}" CODE_SIGNING_ALLOWED=NO build`,
      {
        cwd: path.join(mobileAppDir, 'ios', 'App'),
        env: buildEnv,
        stdio: 'inherit'
      }
    );
    const builtAppDir = path.join(
      derivedDataPath,
      'Build',
      'Products',
      'Debug-iphonesimulator',
      'App.app'
    );
    if (fs.existsSync(builtAppDir)) {
      iosAppZipName = `VeerXcape-v${version}-iOS-Simulator.app.zip`;
      const iosAppZipDest = path.join(targetDir, iosAppZipName);
      execSync(`ditto -c -k --sequesterRsrc --keepParent "${builtAppDir}" "${iosAppZipDest}"`, {
        stdio: 'inherit'
      });
    }
  } catch (err) {
    console.warn(
      'Note: xcodebuild simulator bundle step skipped or requires local CocoaPods workspace setup:',
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    fs.rmSync(derivedDataPath, { recursive: true, force: true });
  }

  const apkHash = sha256File(apkDest);
  const apkSizeMb = (fs.statSync(apkDest).size / (1024 * 1024)).toFixed(2);

  const manifestContent = `# VeerXcape Mobile App — Release version ${version}

- **Version Name**: \`${version}\`
- **Version Code**: \`${versionCode}\`
- **Application / Bundle ID**: \`com.zealion.veerxcape\`
- **Firebase Project**: \`veerxcape-01\`
- **Built At**: \`${new Date().toISOString()}\`

## Included Release Files

1. **Android Installable APK**: [\`VeerXcape-v${version}.apk\`](./VeerXcape-v${version}.apk)
   - Size: \`${apkSizeMb} MB\`
   - SHA-256: \`${apkHash}\`
   - Ready to install directly on any Android device or emulator (\`adb install VeerXcape-v${version}.apk\`).
2. **Android Release Unsigned APK**: [\`VeerXcape-v${version}-release-unsigned.apk\`](./VeerXcape-v${version}-release-unsigned.apk)
3. **iOS Openable Xcode Project**: [\`ios-openable/App/App.xcodeproj\`](./ios-openable/App/App.xcodeproj) (or \`App.xcworkspace\` after \`pod install\`)
   - Pre-configured with \`GoogleService-Info.plist\` and synced web assets in \`ios-openable/App/App/public\`.
   - Open directly in Xcode on macOS: \`open "Release/version ${version}/ios-openable/App/App.xcodeproj"\`.
${iosAppZipName ? `4. **Pre-Built iOS Simulator App Bundle**: [\`${iosAppZipName}\`](./${iosAppZipName}) (Unzip and drag \`App.app\` onto any booted iOS Simulator).` : ''}

## Generating the Next Version (e.g. version ${majorStr}.${Number.parseInt(minorStr, 10) + 1})

Run:
\`\`\`bash
npm run release:app
\`\`\`
This automatically increments the version folder inside \`Release/\` (e.g. \`Release/version ${majorStr}.${Number.parseInt(minorStr, 10) + 1}\`) and builds the updated Android \`.apk\` and iOS openable project.
`;

  fs.writeFileSync(
    path.join(targetDir, 'RELEASE_MANIFEST.md'),
    manifestContent,
    'utf8'
  );

  console.log(`\nSuccessfully created Release/version ${version}!`);
}

main();
