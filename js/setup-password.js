// The Setup passcode, shared so both the Setup section and any quick
// passcode-gated action elsewhere (e.g. editing a question directly from
// the Questions page) check the same value.
//
// This is a soft deterrent only, not real security — a static site with
// no server can't hide this from anyone who opens dev tools. It's meant
// to keep a curious kid from poking around, not to protect sensitive data.
export const SETUP_PASSWORD = "1967";
