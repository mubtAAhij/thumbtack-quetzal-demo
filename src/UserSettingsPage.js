import React, { useState } from "react";
import "./UserSettingsPage.css";

const UserSettingsPage = ({
    preferredLanguage,
    setShowUserSettingsPage,
    handleSaveSettings,
}) => {
    const [tempLanguage, setTempLanguage] = useState(preferredLanguage);
    const [translationOn, setTranslationOn] = useState(
        localStorage.getItem("translationOn") === "true"
    );

    return (
        <div className="settings-page">
            <h2>User Settings</h2>
            <div className="settings-card">
                <h3>Translation Preferences</h3>
                <p>
                    Automatically translate messages into your preferred
                    language.
                </p>

                {/* Toggle Translation */}
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={translationOn}
                        onChange={() => setTranslationOn(!translationOn)}
                    />
                    Turn on translation
                </label>

                {/* Language Select */}
                {translationOn ? (
                    <>
                        <label className="settings-label">
                            Preferred Language:
                        </label>
                        <select
                            value={tempLanguage}
                            onChange={(e) => setTempLanguage(e.target.value)}
                            className="settings-select"
                        >
                            <option value="en-US">English</option>
                            <option value="es-ES">Spanish</option>
                            <option value="pt-PT">Portuguese</option>
                            <option value="zh-CN">Chinese (Simplified)</option>
                        </select>
                    </>
                ) : null}

                {/* Action Buttons */}
                <div className="settings-buttons">
                    <button
                        className="cancel-button"
                        onClick={() => setShowUserSettingsPage(false)}
                    >
                        Cancel
                    </button>
                    <button
                        className="save-button"
                        onClick={() => {
                            handleSaveSettings({
                                preferredLanguage: tempLanguage,
                                translationOn,
                            });
                            setShowUserSettingsPage(false);
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserSettingsPage;
