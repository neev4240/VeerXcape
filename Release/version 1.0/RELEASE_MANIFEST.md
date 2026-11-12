# VeerXcape Mobile App — Release version 1.0

- **Version Name**: `1.0`
- **Version Code**: `10`
- **Application / Bundle ID**: `com.zealion.veerxcape`
- **Firebase Project**: `veerxcape-01`
- **Built At**: `2026-11-12T04:09:09.369Z`

## Included Release Files

1. **Android Installable APK**: [`VeerXcape-v1.0.apk`](./VeerXcape-v1.0.apk)
   - Size: `3.89 MB`
   - SHA-256: `bddbd5ae1d7c696100cb75b4629191216e0a690506b99e843ada5b12f99269a5`
   - Ready to install directly on any Android device or emulator (`adb install VeerXcape-v1.0.apk`).
2. **Android Release Unsigned APK**: [`VeerXcape-v1.0-release-unsigned.apk`](./VeerXcape-v1.0-release-unsigned.apk)
3. **iOS Openable Xcode Project**: [`ios-openable/App/App.xcodeproj`](./ios-openable/App/App.xcodeproj) (or `App.xcworkspace` after `pod install`)
   - Pre-configured with `GoogleService-Info.plist` and synced web assets in `ios-openable/App/App/public`.
   - Open directly in Xcode on macOS: `open "Release/version 1.0/ios-openable/App/App.xcodeproj"`.


## Generating the Next Version (e.g. version 1.1)

Run:
```bash
npm run release:app
```
This automatically increments the version folder inside `Release/` (e.g. `Release/version 1.1`) and builds the updated Android `.apk` and iOS openable project.
