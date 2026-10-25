// Order matters. @walletconnect/react-native-compat MUST be first: it installs
// crypto.getRandomValues, TextEncoder/Decoder and URL shims WalletConnect needs.
import '@walletconnect/react-native-compat';
// Kept explicitly (idempotent) so non-WC crypto keeps working if compat changes.
import 'react-native-get-random-values';
import 'fast-text-encoding';
