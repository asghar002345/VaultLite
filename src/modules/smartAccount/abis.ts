import { parseAbi } from 'viem';

/** Minimal ABIs, hand-checked against /workspace/smart-account/out/*.json (see __tests__/smart-account.test.ts). */
export const accountFactoryAbi = parseAbi([
  'function getAddress(bytes initData, bytes32 salt) view returns (address)',
  'function createAccount(bytes initData, bytes32 salt) returns (address)',
  'function implementation() view returns (address)',
  'function ENTRY_POINT() view returns (address)',
]);

export const smartAccountAbi = parseAbi([
  'struct ModuleInit { uint256 moduleTypeId; address module; bytes initData; }',
  'function initialize(ModuleInit[] modules)',
  'function execute(bytes32 mode, bytes executionCalldata) payable',
  'function installModule(uint256 moduleTypeId, address module, bytes initData)',
  'function isModuleInstalled(uint256 moduleTypeId, address module, bytes data) view returns (bool)',
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
]);

export const ecdsaValidatorAbi = parseAbi([
  'function ownerOf(address account) view returns (address)',
  'function accountMessageDigest(address account, bytes32 hash) view returns (bytes32)',
]);

export const sessionKeyValidatorAbi = parseAbi([
  'function sessionIdOf(address account, address sessionKey, bytes32 salt) view returns (bytes32)',
]);

export const entryPointAbi = parseAbi(['function getNonce(address sender, uint192 key) view returns (uint256)']);
