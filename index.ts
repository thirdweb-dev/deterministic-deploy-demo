import { config } from "dotenv";
import {
  createThirdwebClient,
  defineChain,
  eth_gasPrice,
  eth_getTransactionCount,
  getRpcClient,
  numberToHex,
  toSerializableTransaction,
} from "thirdweb";
import { getWalletBalance } from "thirdweb/wallets";
import {
  computePublishedContractAddress,
  prepareDeterministicDeployTransaction,
} from "thirdweb/deploys";
import { isContractDeployed } from "thirdweb/utils";
import { Engine } from "@thirdweb-dev/engine";

config();

const SUPPORTED_TESTNETS: number[] = [
  97, // binance-testnet
  11155111, // sepolia
  80002, // polygon-amoy
  84532, // base-sepolia
  11155420, // optimism-sepolia
  421614, // arbitrum-sepolia
  59141, // linea-sepolia
  44787, // celo-alfajores-testnet
  37714555429, // xai-sepolia
  43113, // avalanche-fuji
  10200, // chiado-testnet
  534351, // scroll-sepolia-testnet
  167009, // taiko-hekla-l2
  999999999, // zora-sepolia-testnet
  919, // mode-testnet
  2522, // frax-testnet
  4202, // lisk-testnet
  28122024, // ancient8-testnet
  335, // dfk-testnet
  1001, // klaytn-baobab
  168587773, // blast-sepolia
  132902, // form-testnet
  111557560, // cyber-testnet
  325000, // camp-network-testnet-v2
  978657, // treasure-ruby
  17069, // garnet-holesky (redstone testnet)
  1993, // b3-sepolia
  161221135, // plume-testnet
  5003, // mantle-sepolia-testnet
  78600, // vanguard (vanar testnet)
  37084624, // skale-nebula-hub-testnet
  1952959480, // lumia-testnet
  31, // rootstock-testnet
];

const SUPPORTED_MAINNETS: number[] = [
  1, // ethereum
  137, // polygon
  42161, // arbitrum
  10, // optimism
  42220, // celo
  8453, // base
  59144, // linea
  43114, // avalanche
  534352, // scroll
  100, // gnosis
  56, // binance
  660279, // xai
  7777777, // zora
  34443, // mode
  252, // frax
  42170, // arbitrum nova
  888888888, // ancient8
  53935, // dfk
  8217, // klaytn-cypress
  204, // opbnb
  22222, // nautilus
  122, // fuse
  252, // fraxtal
  7887, // kinto
  957, // lyra
  5000, // mantle
  666666666, // degen
  7560, // cyber
  690, // redstone
  2040, // vanar
];

const TW_DEPLOYER_WALLET = "0xdd99b75f095d0c4d5112aCe938e4e6ed962fb024";

// chains to deploy to
const chainsToDeployTo = [...SUPPORTED_MAINNETS, ...SUPPORTED_TESTNETS].map(
  (id) => defineChain(id)
);

const contractsToDeploy = [
  {
    contractId: "AccountExtension",
    constructorParams: [],
  },
  {
    contractId: "AccountFactory",
    constructorParams: [
      TW_DEPLOYER_WALLET, // admin
      "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // entrypoint v0.6 address
    ],
  },
];

if (!process.env.THIRDWEB_SECRET_KEY) {
  throw new Error("No thirdweb secret key found");
}

if (!process.env.THIRDWEB_ENGINE_URL) {
  throw new Error("No thirdweb engine url found");
}

if (!process.env.THIRDWEB_ENGINE_ACCESS_TOKEN) {
  throw new Error("No thirdweb engine access token found");
}

if (!process.env.THIRDWEB_ENGINE_BACKEND_WALLET) {
  throw new Error("No thirdweb engine backend wallet found");
}

const engine = new Engine({
  url: process.env.THIRDWEB_ENGINE_URL!,
  accessToken: process.env.THIRDWEB_ENGINE_ACCESS_TOKEN!,
});

const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

const aaEngineDeployer = process.env.THIRDWEB_ENGINE_BACKEND_WALLET;

const main = async () => {
  console.log("Deploying contracts with account:", aaEngineDeployer);
  for (const chain of chainsToDeployTo) {
    for (const contract of contractsToDeploy) {
      const params = {
        client,
        chain,
        // the name of the published contract to deploy ex: AccountFactory for the contract https://thirdweb.com/thirdweb.eth/AccountFactory
        contractId: contract.contractId,
        // The full list of constructor arguments for the published contract (for AccountFactory we just need the admin and Entrypoint address)
        constructorParams: contract.constructorParams,
      };

      console.log("----------");
      console.log(
        `Checking ${contract.contractId} deployment on chain:`,
        chain.name || chain.id
      );
      const balance = await getWalletBalance({
        client,
        address: aaEngineDeployer,
        chain,
      });
      console.log("Balance:", balance.displayValue, balance.symbol);
      // predict the address before deployement
      const predictedAddress = await computePublishedContractAddress(params);

      const isDeployed = await isContractDeployed({
        chain,
        client,
        address: predictedAddress,
      });

      if (isDeployed) {
        console.log("Already deployed at address:", predictedAddress);
        continue;
      }

      if (balance.value === BigInt(0)) {
        console.log(
          "Insufficient balance to deploy on chain",
          chain.name || chain.id
        );
        continue;
      }

      console.log(
        "Deploying on",
        chain.name || chain.id,
        "at address:",
        predictedAddress
      );

      try {
        const rpcRequest = getRpcClient({ client, chain });
        const deployTx = prepareDeterministicDeployTransaction(params);
        const tx = await toSerializableTransaction({
          transaction: deployTx,
        });

        const signedTx = await engine.backendWallet.signTransaction(
          aaEngineDeployer,
          {
            transaction: {
              to: tx.to?.toString(),
              nonce: numberToHex(
                await eth_getTransactionCount(rpcRequest, {
                  address: aaEngineDeployer as `0x${string}`,
                  blockTag: "pending",
                })
              ),
              gasLimit: numberToHex(tx.gas),
              data: tx.data,
              value: "0x0",
              chainId: chain.id,
              gasPrice: numberToHex(await eth_gasPrice(rpcRequest)),
            },
          }
        );

        const transactionHash = await engine.transaction.sendRawTransaction(
          chain.id.toString(),
          {
            signedTransaction: signedTx.result,
          }
        );

        // const response = await engine.deploy.deployPublished(
        //   chain.id.toString(),
        //   "deployer.thirdweb.eth",
        //   params.contractId,
        //   aaEngineDeployer,
        //   {
        //     saltForProxyDeploy: // RAW SALT WITH PREFIX + ENCODEDARGS + BYTECODE,
        //     constructorParams: params.constructorParams,
        //   }
        // );
        // if (!response.queueId) {
        //   console.error("Failed to deploy published contract. ", response);
        //   continue;
        // }
        // let status = undefined;
        // let isComplete = false;
        // while (!isComplete) {
        //   status = await engine.transaction.status(response.queueId);
        //   isComplete = status?.result?.status
        //     ? ["mined", "errored", "cancelled"].includes(status.result.status)
        //     : false;
        //   await new Promise((resolve) => setTimeout(resolve, 1000));
        // }
        // if (status?.result?.status !== "mined") {
        //   console.error(
        //     "Transaction failed to be mined." + status?.result?.errorMessage
        //   );
        //   continue;
        // }
        // const transactionHash = status.result.transactionHash;

        console.log(">>> Succesfully deployed at address:", predictedAddress);
        console.log(">>> Transaction hash:", transactionHash);
      } catch (e) {
        console.error("Something went wrong, skipping chain", e);
      }
    }
  }
};

main();
