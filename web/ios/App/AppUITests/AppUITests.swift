import XCTest

final class AppUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["UITEST_REAL_DEVICE_BILLING=1"]
        app.launch()
    }

    func testWelcomeScreenShowsContinueCTA() throws {
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 20))
    }

    func testPricingShowsBillingEntryPointsForPreparedAccount() throws {
        try loginWithPreparedAccount()
        try openProfile()

        let tryFree = app.buttons["Try Free"]
        if tryFree.waitForExistence(timeout: 8) {
            tryFree.tap()
            XCTAssertTrue(app.staticTexts["Monthly"].waitForExistence(timeout: 20))
            XCTAssertTrue(app.staticTexts["Yearly"].waitForExistence(timeout: 20))
            XCTAssertTrue(app.buttons["Restore Purchases"].waitForExistence(timeout: 20))
            return
        }

        XCTAssertTrue(app.buttons["Manage Subscription"].waitForExistence(timeout: 20))
    }

    func testCompanionSheetShowsTipButtonsForPreparedAccount() throws {
        try openPreparedChat()

        let companionName = preparedCompanionName()
        XCTAssertTrue(app.staticTexts[companionName].waitForExistence(timeout: 20))
        app.staticTexts[companionName].firstMatch.tap()

        XCTAssertTrue(app.buttons["$9.99"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["$19.99"].exists)
        XCTAssertTrue(app.buttons["$49.99"].exists)
        XCTAssertTrue(app.buttons["$99.99"].exists)
    }

    func testChatTipPromoButtonsRenderWhenPromoStateIsPrepared() throws {
        try openPreparedChat()

        let maybeLater = app.buttons["Maybe later"]
        guard maybeLater.waitForExistence(timeout: 10) else {
            throw XCTSkip("Prepared billing account must already be in a visible tip-promo state for this test.")
        }

        XCTAssertTrue(app.buttons["$9.99"].exists)
        XCTAssertTrue(app.buttons["$19.99"].exists)
        XCTAssertTrue(app.buttons["$49.99"].exists)
        XCTAssertTrue(app.buttons["$99.99"].exists)
    }

    func testChatKeyboardKeepsHeaderAnchoredAndInputVisible() throws {
        try openPreparedChat()

        let backButton = app.buttons["Back to companions"]
        XCTAssertTrue(backButton.waitForExistence(timeout: 20))
        let initialHeaderY = backButton.frame.minY

        let input = app.textViews["Chat message input"]
        XCTAssertTrue(input.waitForExistence(timeout: 20))
        input.tap()

        try assertInputVisibleAboveKeyboard(input)
        dismissKeyboardIfNeeded()
        XCTAssertTrue(waitForKeyboardToHide())
        XCTAssertEqual(backButton.frame.minY, initialHeaderY, accuracy: 6)
    }

    func testSupportKeyboardKeepsHeaderAnchoredAndInputVisible() throws {
        try loginWithPreparedAccount()
        try openProfile()

        let supportButton = app.buttons["Contact Support"]
        XCTAssertTrue(supportButton.waitForExistence(timeout: 20))
        supportButton.tap()

        let backButton = app.buttons["Back to profile"]
        XCTAssertTrue(backButton.waitForExistence(timeout: 20))
        let initialHeaderY = backButton.frame.minY

        let input = app.textFields["Support message input"]
        XCTAssertTrue(input.waitForExistence(timeout: 20))
        input.tap()

        try assertInputVisibleAboveKeyboard(input)
        dismissKeyboardIfNeeded()
        XCTAssertTrue(waitForKeyboardToHide())
        XCTAssertEqual(backButton.frame.minY, initialHeaderY, accuracy: 6)
    }

    func testAddEmailKeyboardKeepsHeaderAnchoredAndInputVisible() throws {
        try loginWithRelayPreparedAccount()
        try openProfile()

        let addEmailButton = app.buttons["Open add email page"]
        guard addEmailButton.waitForExistence(timeout: 20) else {
            throw XCTSkip("Relay test account must show the add-email prompt on Profile.")
        }
        addEmailButton.tap()

        let backButton = app.buttons["Back to profile"]
        XCTAssertTrue(backButton.waitForExistence(timeout: 20))
        let initialHeaderY = backButton.frame.minY

        let input = app.textFields["Email address"]
        XCTAssertTrue(input.waitForExistence(timeout: 20))
        input.tap()

        try assertInputVisibleAboveKeyboard(input)
        dismissKeyboardIfNeeded()
        XCTAssertTrue(waitForKeyboardToHide())
        XCTAssertEqual(backButton.frame.minY, initialHeaderY, accuracy: 6)
    }

    private func loginWithPreparedAccount() throws {
        if app.buttons["Profile"].waitForExistence(timeout: 5) {
            return
        }

        let env = ProcessInfo.processInfo.environment
        guard let email = env["UITEST_EMAIL"], !email.isEmpty,
              let password = env["UITEST_PASSWORD"], !password.isEmpty else {
            throw XCTSkip("Set UITEST_EMAIL and UITEST_PASSWORD in the test scheme to run billing UI tests.")
        }

        try login(email: email, password: password)
    }

    private func loginWithRelayPreparedAccount() throws {
        let env = ProcessInfo.processInfo.environment
        guard let email = env["UITEST_RELAY_EMAIL"], !email.isEmpty,
              let password = env["UITEST_RELAY_PASSWORD"], !password.isEmpty else {
            throw XCTSkip("Set UITEST_RELAY_EMAIL and UITEST_RELAY_PASSWORD in the test scheme to run add-email keyboard coverage.")
        }

        try logoutIfNeeded()
        try login(email: email, password: password)
    }

    private func login(email: String, password: String) throws {
        if app.buttons["Continue"].waitForExistence(timeout: 10) {
            app.buttons["Continue"].tap()
        }

        let signInLink = app.buttons["Sign in"]
        XCTAssertTrue(signInLink.waitForExistence(timeout: 20))
        signInLink.tap()

        let emailField = app.textFields.element(boundBy: 0)
        XCTAssertTrue(emailField.waitForExistence(timeout: 20))
        emailField.tap()
        emailField.typeText(email)

        let passwordField = app.secureTextFields.element(boundBy: 0)
        XCTAssertTrue(passwordField.waitForExistence(timeout: 20))
        passwordField.tap()
        passwordField.typeText(password)

        let submit = app.buttons["Sign in"]
        XCTAssertTrue(submit.waitForExistence(timeout: 10))
        submit.tap()

        XCTAssertTrue(app.buttons["Profile"].waitForExistence(timeout: 30))
    }

    private func logoutIfNeeded() throws {
        if app.buttons["Profile"].waitForExistence(timeout: 5) {
            try openProfile()
        } else if !app.staticTexts["Profile"].waitForExistence(timeout: 5) {
            return
        }

        let signOutButton = app.buttons["Sign out"]
        guard signOutButton.waitForExistence(timeout: 10) else {
            return
        }

        signOutButton.tap()
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 20) || app.buttons["Sign in"].waitForExistence(timeout: 20))
    }

    private func openProfile() throws {
        let profileButton = app.buttons["Profile"]
        XCTAssertTrue(profileButton.waitForExistence(timeout: 20))
        profileButton.tap()
        XCTAssertTrue(app.staticTexts["Profile"].waitForExistence(timeout: 20))
    }

    private func openPreparedChat() throws {
        try loginWithPreparedAccount()

        let companionName = preparedCompanionName()
        let companionCard = app.staticTexts[companionName]
        guard companionCard.waitForExistence(timeout: 20) else {
            throw XCTSkip("Prepared billing account must have a companion named \(companionName).")
        }

        companionCard.tap()
        XCTAssertTrue(app.staticTexts[companionName].waitForExistence(timeout: 20))
    }

    private func preparedCompanionName() -> String {
        let value = ProcessInfo.processInfo.environment["UITEST_COMPANION_NAME"] ?? "Luna"
        return value.isEmpty ? "Luna" : value
    }

    private func assertInputVisibleAboveKeyboard(_ input: XCUIElement) throws {
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 10))
        XCTAssertGreaterThan(keyboard.frame.height, 0)
        XCTAssertLessThan(input.frame.maxY, keyboard.frame.minY)
    }

    private func dismissKeyboardIfNeeded() {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists else { return }

        if app.toolbars.buttons["Done"].exists {
            app.toolbars.buttons["Done"].tap()
            return
        }

        let appTop = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12))
        appTop.tap()

        if keyboard.exists, keyboard.buttons["Return"].exists {
            keyboard.buttons["Return"].tap()
        } else if keyboard.exists, keyboard.buttons["return"].exists {
            keyboard.buttons["return"].tap()
        }
    }

    private func waitForKeyboardToHide(timeout: TimeInterval = 10) -> Bool {
        let keyboard = app.keyboards.firstMatch
        let predicate = NSPredicate(format: "exists == false")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: keyboard)
        return XCTWaiter().wait(for: [expectation], timeout: timeout) == .completed
    }
}
