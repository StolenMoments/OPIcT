package shop.mygreed.opict

import android.graphics.Color
import androidx.core.view.WindowCompat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WebThemeBridgeTest {
    @Test
    fun `web theme updates native system bar color and icon contrast`() {
        val activity = Robolectric.buildActivity(MainActivity::class.java).create().get()
        val applyTheme = MainActivity::class.java.declaredMethods.singleOrNull {
            it.name == "applyWebTheme" && it.parameterTypes.contentEquals(arrayOf(Boolean::class.javaPrimitiveType))
        }
        assertNotNull("MainActivity must expose the theme application path used by its JavaScript bridge", applyTheme)
        applyTheme!!.isAccessible = true

        applyTheme.invoke(activity, true)
        var controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        assertEquals(Color.parseColor("#221D19"), activity.window.navigationBarColor)
        assertFalse(controller.isAppearanceLightStatusBars)
        assertFalse(controller.isAppearanceLightNavigationBars)

        applyTheme.invoke(activity, false)
        controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        assertEquals(Color.parseColor("#F8F7F5"), activity.window.navigationBarColor)
        assertTrue(controller.isAppearanceLightStatusBars)
        assertTrue(controller.isAppearanceLightNavigationBars)
    }
}
