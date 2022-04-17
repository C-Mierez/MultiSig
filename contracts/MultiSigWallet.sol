// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

contract MultiSigWallet {
    /* --------------------------------- Errors --------------------------------- */
    error ZeroValue();
    error ZeroOwners();
    error ZeroAddress();
    error AlreadyOwner(address owner);
    error InvalidValue(uint256 value);
    error UnauthorizedCaller(address caller);
    error InvalidTX(uint256 txId);
    error NotEnoughApprovals(uint256 required, uint256 current);
    error FailedTX(uint256 txId);

    /* --------------------------------- Events --------------------------------- */
    event Approved(address indexed owner, uint256 indexed txId);
    event Revoked(address indexed owner, uint256 indexed txId);
    event Deposited(address indexed sender, uint256 amount);
    event Executed(uint256 indexed txId);
    event Submitted(uint256 indexed txId);

    /* --------------------------------- Structs -------------------------------- */
    struct TX {
        address to;
        uint256 value;
        bytes data;
        bool executed;
    }

    /* ---------------------------------- Vars ---------------------------------- */
    address[] public s_owners;
    TX[] public s_transactions;

    mapping(address => bool) public s_isOwner;

    /// @dev Index -> Owner -> isApproved
    mapping(uint256 => mapping(address => bool)) public s_isApproved;

    /// @notice Amount of approvals required for a tx to be executed.
    uint256 public s_requiredApprovals;

    /* ------------------------------- Constructor ------------------------------ */
    constructor(address[] memory _owners, uint256 _requiredApprovals) {
        if (_owners.length == 0) revert ZeroOwners();
        if (_requiredApprovals == 0 || _requiredApprovals > _owners.length)
            revert InvalidValue(_requiredApprovals);

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            if (owner == address(0)) revert ZeroAddress();
            if (s_isOwner[owner]) revert AlreadyOwner(owner);

            s_isOwner[owner] = true;
            s_owners.push(owner);
        }

        s_requiredApprovals = _requiredApprovals;
    }

    /* -------------------------------- Modifier -------------------------------- */
    modifier onlyOwner(address _caller) {
        if (!s_isOwner[_caller]) revert UnauthorizedCaller(_caller);
        _;
    }

    modifier txExists(uint256 _txId) {
        if (_txId >= s_transactions.length) revert InvalidTX(_txId);
        _;
    }

    modifier notApproved(uint256 _txId, address _caller) {
        if (s_isApproved[_txId][_caller]) revert InvalidTX(_txId);
        _;
    }

    modifier notExecuted(uint256 _txId) {
        if (s_transactions[_txId].executed) revert InvalidTX(_txId);
        _;
    }

    /* -------------------------------- Functions ------------------------------- */
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function submit(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external onlyOwner(msg.sender) {
        s_transactions.push(
            TX({to: _to, value: _value, data: _data, executed: false})
        );
        emit Submitted(s_transactions.length - 1);
    }

    function approve(uint256 _txId)
        external
        onlyOwner(msg.sender)
        txExists(_txId)
        notApproved(_txId, msg.sender)
        notExecuted(_txId)
    {
        s_isApproved[_txId][msg.sender] = true;
        emit Approved(msg.sender, _txId);
    }

    function execute(uint256 _txId)
        external
        onlyOwner(msg.sender)
        txExists(_txId)
        notExecuted(_txId)
    {
        uint256 currentApprovals = _getApprovalAmount(_txId);
        if (currentApprovals < s_requiredApprovals)
            revert NotEnoughApprovals(s_requiredApprovals, currentApprovals);

        TX storage transaction = s_transactions[_txId];

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );

        if (!success) revert FailedTX(_txId);

        emit Executed(_txId);
    }

    function revoke(uint256 _txId)
        external
        onlyOwner(msg.sender)
        txExists(_txId)
        notExecuted(_txId)
    {
        if (!s_isApproved[_txId][msg.sender]) revert InvalidTX(_txId);

        s_isApproved[_txId][msg.sender] = false;

        emit Revoked(msg.sender, _txId);
    }

    function _getApprovalAmount(uint256 _txId)
        private
        view
        returns (uint256 amount)
    {
        for (uint256 i = 0; i < s_owners.length; i++) {
            if (s_isApproved[_txId][s_owners[i]]) {
                amount += 1;
            }
        }
    }
}
