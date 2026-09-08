"""add student coach profile and badges

数字人教练底座：
  - student_coach_profiles：跨场景长期记忆 / 形象声音偏好 / 成就计数
  - coach_badges：成就徽章目录

Revision ID: c0a1b2c3d4e5
Revises: b3a4c5d6e7f8
Create Date: 2026-09-08 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c0a1b2c3d4e5'
down_revision: Union[str, Sequence[str], None] = 'b3a4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'student_coach_profiles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, unique=True),
        sa.Column('weak_topics', sa.JSON(), nullable=False),
        sa.Column('error_type_counts', sa.JSON(), nullable=False),
        sa.Column('prefs', sa.JSON(), nullable=False),
        sa.Column('last_state', sa.String(16), nullable=False, server_default='流畅'),
        sa.Column('last_state_at', sa.DateTime(), nullable=True),
        sa.Column('experiments_done', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('incidents_avoided', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('badges', sa.JSON(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        'coach_badges',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code', sa.String(64), nullable=False, unique=True),
        sa.Column('name', sa.String(128), nullable=False, server_default=''),
        sa.Column('desc', sa.String(256), nullable=False, server_default=''),
        sa.Column('icon', sa.String(32), nullable=False, server_default='🏅'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('coach_badges')
    op.drop_table('student_coach_profiles')
