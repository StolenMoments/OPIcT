package shop.mygreed.opict

import android.net.Uri
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WebViewPermissionPolicyTest {
    private val origin = Uri.parse("https://opict.mygreed.shop/")

    @Test
    fun `grants audio capture only to the production origin`() {
        assertTrue(WebViewPermissionPolicy.canGrantAudioCapture(origin, arrayOf("android.webkit.resource.AUDIO_CAPTURE")))
        assertFalse(
            WebViewPermissionPolicy.canGrantAudioCapture(
                Uri.parse("https://example.com/"),
                arrayOf("android.webkit.resource.AUDIO_CAPTURE"),
            ),
        )
    }

    @Test
    fun `rejects mixed or non audio resource requests`() {
        assertFalse(
            WebViewPermissionPolicy.canGrantAudioCapture(
                origin,
                arrayOf("android.webkit.resource.AUDIO_CAPTURE", "android.webkit.resource.VIDEO_CAPTURE"),
            ),
        )
        assertFalse(
            WebViewPermissionPolicy.canGrantAudioCapture(origin, arrayOf("android.webkit.resource.VIDEO_CAPTURE")),
        )
    }
}
