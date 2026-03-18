import XCTest

final class AppUITestsLaunchTests: XCTestCase {
    override class var runsForEachTargetApplicationUIConfiguration: Bool {
        true
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testLaunch() throws {
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_REAL_DEVICE_BILLING=1"]
        app.launch()

        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 20))
    }
}
