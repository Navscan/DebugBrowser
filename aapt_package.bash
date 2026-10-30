aapt package -f -m -J src -M AndroidManifest.xml -S res -I $ANDROID_SDK_ROOT/platforms/android-30/android.jar
mkdir -p classes
javac --release 8 -cp $ANDROID_SDK_ROOT/platforms/android-30/android.jar -d classes src/com/debug/browser/*.java
cd classes && jar cf ../classes.jar . && cd ..
$ANDROID_SDK_ROOT/build-tools/30.0.3/dx --dex --min-sdk-version=21 --output=classes.dex classes.jar
aapt package -f -M AndroidManifest.xml -S res -I $ANDROID_SDK_ROOT/platforms/android-30/android.jar -F DebugBrowser.unsigned.apk
zip -j DebugBrowser.unsigned.apk classes.dex
apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android DebugBrowser.unsigned.apk
mv DebugBrowser.unsigned.apk DebugBrowser.apk
