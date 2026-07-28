package shop.mygreed.opict

import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class NavigationPolicyTest {
    @Test
    fun `exact production HTTPS origin is internal`() {
        assertDestination(NavigationDestination.INTERNAL, "https://opict.mygreed.shop/")
        assertDestination(NavigationDestination.INTERNAL, "https://opict.mygreed.shop/login?next=%2Fstudy#form")
        assertDestination(NavigationDestination.INTERNAL, "https://opict.mygreed.shop:443/stats")
    }

    @Test
    fun `other HTTPS hosts are external`() {
        assertDestination(NavigationDestination.EXTERNAL, "https://example.com/source")
        assertDestination(NavigationDestination.EXTERNAL, "https://www.google.com/")
    }

    @Test
    fun `mail and telephone links are external`() {
        assertDestination(NavigationDestination.EXTERNAL, "mailto:hello@example.com")
        assertDestination(NavigationDestination.EXTERNAL, "tel:+821012345678")
    }

    @Test
    fun `insecure and deceptive web URLs are blocked`() {
        assertDestination(NavigationDestination.BLOCKED, "http://opict.mygreed.shop/")
        assertDestination(NavigationDestination.BLOCKED, "https://opict.mygreed.shop:444/")
        assertDestination(NavigationDestination.BLOCKED, "https://user@opict.mygreed.shop/")
        assertDestination(NavigationDestination.BLOCKED, "https://sub.opict.mygreed.shop/")
        assertDestination(NavigationDestination.BLOCKED, "https://opict.mygreed.shop.example.com/")
        assertDestination(NavigationDestination.BLOCKED, "https://opict.mygreed.shop.evil/")
    }

    @Test
    fun `dangerous and unknown schemes are blocked`() {
        listOf(
            "file:///data/local/tmp/payload.html",
            "content://shop.mygreed.provider/item",
            "javascript:alert(1)",
            "intent://scan/#Intent;scheme=zxing;end",
            "data:text/html,hello",
            "about:blank",
        ).forEach { assertDestination(NavigationDestination.BLOCKED, it) }
    }

    private fun assertDestination(expected: NavigationDestination, rawUrl: String) {
        assertEquals(rawUrl, expected, NavigationPolicy.classify(Uri.parse(rawUrl)))
    }
}
