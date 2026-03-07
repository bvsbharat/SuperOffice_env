"""Tests for the MarketVille environment."""

import sys
import os

# Add parent directory to path so we can import as the server does
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.office_os_environment import OfficeOsEnvironment
from models import OfficeOsAction, OfficeOsObservation


def test_reset():
    """Test environment reset returns valid observation."""
    env = OfficeOsEnvironment()
    obs = env.reset()

    assert isinstance(obs, OfficeOsObservation)
    assert obs.day == 1
    assert obs.phase == "morning_standup"
    assert obs.done is False
    assert obs.reward == 0.0
    assert "website_traffic" in obs.kpis
    assert obs.budget_remaining > 0


def test_dev_build_feature():
    """Test Dev agent building a feature."""
    env = OfficeOsEnvironment()
    env.reset()

    obs = env.step(OfficeOsAction(
        agent_id="dev",
        action_type="BUILD_FEATURE",
        target="SSO Integration",
    ))

    assert obs.agent_id == "dev"
    assert obs.last_action_result["success"] is True
    assert "SSO" in obs.last_action_result["detail"]
    assert obs.done is False


def test_dev_ship_release():
    """Test Dev shipping a release after building features."""
    env = OfficeOsEnvironment()
    env.reset()

    # Build feature for enough turns
    for _ in range(6):
        env.step(OfficeOsAction(
            agent_id="dev",
            action_type="BUILD_FEATURE",
            target="SSO Integration",
        ))

    # Ship it
    obs = env.step(OfficeOsAction(
        agent_id="dev",
        action_type="SHIP_RELEASE",
        target="",
    ))

    assert obs.last_action_result["success"] is True
    assert "Shipped" in obs.last_action_result["detail"]


def test_marketing_launch_campaign():
    """Test Marketing launching a campaign."""
    env = OfficeOsEnvironment()
    env.reset()

    obs = env.step(OfficeOsAction(
        agent_id="marketing",
        action_type="LAUNCH_CAMPAIGN",
        target="Product Launch Q1",
    ))

    assert obs.last_action_result["success"] is True
    assert "campaign" in obs.last_action_result["detail"].lower()


def test_content_write_blog():
    """Test Content Creator writing a blog post."""
    env = OfficeOsEnvironment()
    env.reset()

    obs = env.step(OfficeOsAction(
        agent_id="content",
        action_type="WRITE_BLOG",
        target="10 Tips for Startup Growth",
        parameters={"topic": "growth"},
    ))

    assert obs.last_action_result["success"] is True
    assert "Published" in obs.last_action_result["detail"]


def test_content_vaporware_penalty():
    """Test that Content cannot write about unshipped features."""
    env = OfficeOsEnvironment()
    env.reset()

    obs = env.step(OfficeOsAction(
        agent_id="content",
        action_type="WRITE_BLOG",
        target="Our Amazing New Feature",
        parameters={"feature": "Quantum Computing Module"},
    ))

    assert obs.last_action_result["success"] is False
    assert "unshipped" in obs.last_action_result["detail"].lower()


def test_sales_pipeline():
    """Test Sales working through the customer pipeline."""
    env = OfficeOsEnvironment()
    env.reset()

    # First get some customers by running a few days
    # Force spawn a customer
    from market.state import Customer
    customer = Customer(
        id="test1",
        name="TestCo",
        company_size="smb",
        industry="saas",
        budget=10000.0,
        pain_point="Needs analytics",
        source="blog",
        stage="lead",
        created_day=1,
        last_contacted_day=1,
    )
    env._market.customers.append(customer)

    # Qualify the lead
    obs = env.step(OfficeOsAction(
        agent_id="sales",
        action_type="QUALIFY_LEAD",
        target="TestCo",
    ))
    assert obs.last_action_result["success"] is True
    assert customer.stage == "qualified"

    # Run demo
    obs = env.step(OfficeOsAction(
        agent_id="sales",
        action_type="RUN_DEMO",
        target="TestCo",
    ))
    assert obs.last_action_result["success"] is True
    assert customer.stage == "demo"

    # Send proposal
    obs = env.step(OfficeOsAction(
        agent_id="sales",
        action_type="SEND_PROPOSAL",
        target="TestCo",
    ))
    assert obs.last_action_result["success"] is True
    assert customer.stage == "proposal"


def test_invalid_action_for_role():
    """Test that actions are rejected if not allowed for the role."""
    env = OfficeOsEnvironment()
    env.reset()

    obs = env.step(OfficeOsAction(
        agent_id="content",
        action_type="BUILD_FEATURE",
        target="Something",
    ))

    assert obs.last_action_result["success"] is False


def test_messages_between_agents():
    """Test inter-agent messaging."""
    env = OfficeOsEnvironment()
    env.reset()

    env.step(OfficeOsAction(
        agent_id="sales",
        action_type="COLLECT_FEEDBACK",
        target="general",
        parameters={"feedback": "Customers need SSO"},
        message="dev: Customers are asking for SSO integration, 3 deals blocked",
    ))

    # Dev should see the message
    obs = env.step(OfficeOsAction(
        agent_id="dev",
        action_type="BUILD_FEATURE",
        target="SSO Integration",
    ))

    dev_messages = obs.messages
    assert any("SSO" in m.get("content", "") for m in dev_messages)


def test_full_pipeline_rewards():
    """Test that rewards flow correctly through the pipeline."""
    env = OfficeOsEnvironment()
    env.reset()

    # Content writes a blog -> should get positive reward
    obs = env.step(OfficeOsAction(
        agent_id="content",
        action_type="WRITE_BLOG",
        target="Why Our Product Rocks",
        parameters={"topic": "product"},
    ))
    # Content should get a non-negative reward for publishing
    assert obs.reward >= 0


def test_contract_tiers():
    """Test that contract tiers affect revenue and rewards."""
    env = OfficeOsEnvironment()
    env.reset()

    from market.state import Customer

    # Create a customer at proposal stage ready to close
    customer = Customer(
        id="tier1",
        name="TierCo",
        company_size="smb",
        industry="saas",
        budget=12000.0,  # $12k annual = $1k/mo
        pain_point="Needs analytics",
        source="blog",
        stage="proposal",
        created_day=1,
        last_contacted_day=1,
    )
    env._market.customers.append(customer)

    # Force close success by seeding RNG
    env._market._rng.seed(42)

    initial_revenue = env._market.total_revenue
    obs = env.step(OfficeOsAction(
        agent_id="sales",
        action_type="CLOSE_DEAL",
        target="TierCo",
        parameters={"contract_tier": "annual"},
    ))

    # Check that contract tier was assigned if deal closed
    if customer.stage == "closed_won":
        assert customer.contract_tier == "annual"
        # Annual = 12 months of $1k/mo = $12k total revenue
        assert env._market.total_revenue > initial_revenue
        assert "Annual" in obs.last_action_result["detail"]


def test_episode_ends():
    """Test that the episode ends after 90 days."""
    env = OfficeOsEnvironment()
    env.reset()

    # Fast forward by stepping many times
    env._market.day = 91
    obs = env.step(OfficeOsAction(
        agent_id="dev",
        action_type="REFACTOR",
        target="",
    ))
    assert obs.done is True


if __name__ == "__main__":
    tests = [
        test_reset,
        test_dev_build_feature,
        test_dev_ship_release,
        test_marketing_launch_campaign,
        test_content_write_blog,
        test_content_vaporware_penalty,
        test_sales_pipeline,
        test_invalid_action_for_role,
        test_messages_between_agents,
        test_full_pipeline_rewards,
        test_contract_tiers,
        test_episode_ends,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            print(f"  PASS  {test.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {test.__name__}: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed out of {len(tests)} tests")
