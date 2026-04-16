# 2026-04-16T17:30:42Z UTC
Processed by: GitHub Copilot

issue is still there, think harder to find out what the difference but I made a key discovery: When there is actually a water tag set on the selected custom sprite sheet, then it suddenly works with the correct procedural water again and there is no more difference between having custon sprite sheet on or default regarding the water rendering. But actually when custom is on and water was tagged on it then that water tiles should be used instead of the procedural.
