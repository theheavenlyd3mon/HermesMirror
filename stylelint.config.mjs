const config = {
	extends: ["stylelint-config-standard", "stylelint-prettier/recommended"],
	root: true,
	rules: {
		// Allow BEM class selectors: block__element--modifier pattern
		"selector-class-pattern": [
			"^[a-z][a-z0-9-]*(__[a-z][a-z0-9-]*)?(--[a-z][a-z0-9-]*)?$",
			{message: "Expected class selector to be kebab-case (BEM pattern allowed)"}
		]
	}
};

export default config;
