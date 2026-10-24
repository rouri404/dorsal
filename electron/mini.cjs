// Entry point of the Dorsal Screen AppImage: the same shell, opened on the mini screen app.
process.env.X85_MINI = "1";
require("./main.cjs");
