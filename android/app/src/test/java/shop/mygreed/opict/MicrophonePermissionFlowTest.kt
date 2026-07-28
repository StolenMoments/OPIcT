package shop.mygreed.opict

import org.junit.Assert.assertEquals
import org.junit.Test

class MicrophonePermissionFlowTest {
    private val flow = MicrophonePermissionFlow()

    @Test
    fun `notifies immediately when Android permission is already granted`() {
        assertEquals(MicrophonePermissionAction.NOTIFY_GRANTED, flow.begin(permissionGranted = true))
    }

    @Test
    fun `waits for the Android result when permission is missing`() {
        assertEquals(MicrophonePermissionAction.REQUEST, flow.begin(permissionGranted = false))
        assertEquals(MicrophonePermissionAction.NOTIFY_GRANTED, flow.finish(permissionGranted = true))
    }

    @Test
    fun `does not notify a stale result after the request was canceled`() {
        assertEquals(MicrophonePermissionAction.REQUEST, flow.begin(permissionGranted = false))
        flow.cancel()

        assertEquals(MicrophonePermissionAction.IGNORE, flow.finish(permissionGranted = true))
    }
}
