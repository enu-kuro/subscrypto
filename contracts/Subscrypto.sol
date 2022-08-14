// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// No security consideration!!!
// TODO: When to take a fee?
// TODO: Meta Transaction
// native token使えないかも
// 毎月同じ日に課金するのはどうやって実現できる？
contract Subscrypto is Ownable {
    address public tokenAddress;
    uint256 public price;
    uint256 public interval;

    struct Subscriber {
        uint256 startAt;
        uint256 count;
    }

    address[] public subscriberAddresses;
    mapping(address => Subscriber) public subscribers;

    // TODO: Events

    constructor(
        address _tokenAddress,
        uint256 _price,
        uint256 _interval
    ) {
        tokenAddress = _tokenAddress;
        price = _price;
        interval = _interval;
    }

    function subscribe() external {
        // TODO: Validation
        IERC20 token = IERC20(tokenAddress);
        require(
            token.transferFrom(msg.sender, address(this), price),
            "Subscription payment failed."
        );
        subscriberAddresses.push(msg.sender);
        subscribers[msg.sender] = Subscriber(block.timestamp, 1);
    }

    // TODO:
    function cancelSubscription() external {}

    function getPaymentTargets()
        external
        view
        onlyOwner
        returns (address[] memory)
    {
        // https://fravoll.github.io/solidity-patterns/memory_array_building.html
        // もっと良い方法ない？
        address[] memory targets = new address[](subscriberAddresses.length);
        uint256 counter = 0;
        for (uint256 i = 0; i < subscriberAddresses.length; i++) {
            Subscriber memory subscriber = subscribers[subscriberAddresses[i]];
            if (
                block.timestamp >
                (subscriber.startAt + subscriber.count * interval)
            ) {
                targets[counter] = subscriberAddresses[i];
                counter++;
            }
        }
        return targets;
    }

    function executePayment(address[] calldata addresses) external onlyOwner {
        IERC20 token = IERC20(tokenAddress);
        for (uint256 i = 0; i < addresses.length; i++) {
            address subscriberAddress = addresses[i];
            if (subscriberAddress == address(0)) {
                continue;
            }
            Subscriber storage subscriber = subscribers[subscriberAddress];

            require(
                block.timestamp >
                    (subscriber.startAt + subscriber.count * interval),
                "Already paid"
            );
            require(
                token.transferFrom(subscriberAddress, address(this), price),
                "Subscription payment failed."
            );

            subscriber.count += 1;
        }
    }
}

// TODO: factory
// contract SubscryptoFactory {
//     Subscrypto[] private _subscryptos;

//     function createFoundation(
//         address _tokenAddress,
//         uint256 _price,
//         uint256 _interval
//     ) public {
//         Subscrypto subscrypto = new Subscrypto(_tokenAddress, _price, _interval);
//         _subscryptos.push(subscrypto);
//     }
// }
