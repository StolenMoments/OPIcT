package shop.mygreed.opict

import android.net.Uri
import android.webkit.PermissionRequest

object WebViewPermissionPolicy {
    fun canGrantAudioCapture(origin: Uri, resources: Array<String>): Boolean {
        return NavigationPolicy.classify(origin) == NavigationDestination.INTERNAL &&
            resources.size == 1 &&
            resources[0] == PermissionRequest.RESOURCE_AUDIO_CAPTURE
    }
}
