# Protection rules

The Test Console is allowed to write only within this `test-console` directory.
It must not modify:

- the old Priya Companion project;
- `REFERENCE_READONLY`;
- the historical `PriyaCompanion-QA` QA Lab;
- Priya application source, configuration, fixtures, or generated native output.

The console does not build APK/EAS artifacts, run large-scale tests, create
hundreds of cases, or claim that the real memory workflow works in Prompt 0.

